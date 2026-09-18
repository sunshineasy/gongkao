import http from "node:http";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { initializeApplicationData, questionBankFile, userDataFile } from "./lib/app-data.js";
import { createUser, getActiveUser, getCurrentSession, getEffectiveAttempts, getLatestSession, getSession, getWrongQuestionIds, invalidateSession, listSessions, listUsers, removeWrongQuestion, replaceOngoingSession, setActiveUser, type Attempt } from "./lib/user-data.js";
import { createPlannedSession, generateSessionPlan } from "./lib/session-planner.js";
import { forwardCurrent, getCompletionStats, nextWrongReviewQuestion, refreshSession, resumeSession, submitCurrentAnswer, submitWrongReviewAnswer } from "./lib/session-runner.js";
import { getStudyBankSummary } from "./lib/study-question-bank.js";

export type StudyServerOptions = { userDataFile: string; questionBankFile: string; webRoot?: string };
type StudyPaths = Required<StudyServerOptions>;
type WrongReviewProcess = { id: string; seen: Set<string>; cleanup: NodeJS.Timeout };
const wrongReviewProcesses = new Map<string, WrongReviewProcess>();
const wrongReviewLifetimeMs = 10 * 60 * 1000;

const reply = (res: http.ServerResponse, status: number, value: unknown, type = "application/json; charset=utf-8") => {
  res.writeHead(status, { "content-type": type });
  res.end(typeof value === "string" ? value : JSON.stringify(value));
};

async function readBody(req: http.IncomingMessage) {
  let text = "";
  for await (const chunk of req) text += chunk;
  try { return JSON.parse(text || "{}") as Record<string, unknown>; } catch { throw new Error("请求格式无效"); }
}

async function current(paths: StudyPaths) {
  const user = await getActiveUser(paths.userDataFile);
  if (!user) return { state: "no_user" as const };
  const progress = await resumeSession({ userId: user.id, userDataFile: paths.userDataFile, questionBankFile: paths.questionBankFile });
  if (!progress) {
    const latest = await getLatestSession(user.id, paths.userDataFile);
    return latest?.status === "completed" ? { state: "completed" as const, user, completion: await getCompletionStats(latest.id, paths.userDataFile) } : { state: "idle" as const, user };
  }
  if (!progress.question) return { state: "completed" as const, user, completion: await getCompletionStats(progress.session.id, paths.userDataFile) };
  const question = progress.question;
  return { state: "ongoing" as const, user, sessionType: progress.session.type, question: { externalId: question.externalId, module: question.module, stem: question.stem, options: question.options.map(({ key, text }) => ({ key, text })), material: question.material && { title: question.material.title, content: question.material.content } } };
}

const questionView = (question: NonNullable<Awaited<ReturnType<typeof nextWrongReviewQuestion>>>) => ({ externalId: question.externalId, module: question.module, stem: question.stem, options: question.options.map(({ key, text }) => ({ key, text })), material: question.material && { title: question.material.title, content: question.material.content } });
function clearWrongReview(userId: string, reviewId?: string) {
  const process = wrongReviewProcesses.get(userId);
  if (!process || (reviewId && process.id !== reviewId)) return;
  clearTimeout(process.cleanup); wrongReviewProcesses.delete(userId);
}
function startWrongReview(userId: string) {
  clearWrongReview(userId);
  const id = randomUUID();
  const cleanup = setTimeout(() => clearWrongReview(userId, id), wrongReviewLifetimeMs);
  const process: WrongReviewProcess = { id, seen: new Set(), cleanup };
  wrongReviewProcesses.set(userId, process);
  return process;
}
function requireWrongReview(userId: string, reviewId: string) {
  const process = wrongReviewProcesses.get(userId);
  if (!process || process.id !== reviewId) throw new Error("错题回顾已离开或已过期，请重新开始");
  return process;
}
async function wrongReviewCurrent(userId: string, reviewId: string, paths: StudyPaths) {
  const process = requireWrongReview(userId, reviewId);
  const question = await nextWrongReviewQuestion({ userId, userDataFile: paths.userDataFile, questionBankFile: paths.questionBankFile, seen: process.seen });
  return question ? { state: "review" as const, reviewId: process.id, question: questionView(question) } : { state: "review_completed" as const, reviewId: process.id };
}
const dayKey = (time: number) => new Date(time).toISOString().slice(0, 10);
const weekKey = (time: number) => { const date = new Date(time); const offset = (date.getUTCDay() + 6) % 7; date.setUTCDate(date.getUTCDate() - offset); return dayKey(date.getTime()); };
const monthKey = (time: number) => new Date(time).toISOString().slice(0, 7);
export function buildLearningTrend(attempts: Attempt[], range: "7d" | "all", now = Date.now()) {
  const oldest = attempts.length ? Math.min(...attempts.map(item => Date.parse(item.submittedAt))) : now;
  const spanDays = Math.max(1, Math.ceil((now - oldest) / 86400000));
  const granularity = range === "7d" || spanDays <= 31 ? "day" : spanDays <= 180 ? "week" : "month";
  const key = granularity === "day" ? dayKey : granularity === "week" ? weekKey : monthKey;
  const grouped = new Map<string, Attempt[]>();
  for (const attempt of attempts) { const label = key(Date.parse(attempt.submittedAt)); grouped.set(label, [...(grouped.get(label) ?? []), attempt]); }
  if (range === "7d") for (let offset = 6; offset >= 0; offset--) { const label = dayKey(now - offset * 86400000); if (!grouped.has(label)) grouped.set(label, []); }
  return { granularity, points: [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, items]) => ({ label, answeredCount: items.length, correctCount: items.filter(item => item.isCorrect).length, accuracy: items.length ? items.filter(item => item.isCorrect).length / items.length : null })) };
}
async function learningStatus(userId: string, paths: StudyPaths, requestedRange: string) {
  const range = requestedRange === "7d" ? "7d" as const : "all" as const;
  const effectiveAttempts = await getEffectiveAttempts(userId, paths.userDataFile);
  const since = range === "7d" ? Date.now() - 7 * 24 * 60 * 60 * 1000 : -Infinity;
  const attempts = effectiveAttempts.filter(item => Date.parse(item.submittedAt) >= since);
  const correctCount = attempts.filter(item => item.isCorrect).length;
  const answerDuration = attempts.reduce((sum, item) => sum + item.cumulativeAnswerDuration, 0);
  const currentSession = await getCurrentSession(userId, paths.userDataFile);
  return { range, answeredCount: attempts.length, correctCount, wrongCount: attempts.length - correctCount, accuracy: attempts.length ? correctCount / attempts.length : null, answerDuration, averageAnswerDuration: attempts.length ? answerDuration / attempts.length : null, wrongCountCurrent: (await getWrongQuestionIds(userId, paths.userDataFile)).length, currentTraining: currentSession ? { state: "ongoing" as const, type: currentSession.type } : { state: "ready" as const }, trend: buildLearningTrend(attempts, range) };
}
async function history(userId: string, paths: StudyPaths) {
  return Promise.all((await listSessions(userId, paths.userDataFile)).map(async session => ({ ...session, completion: await getCompletionStats(session.id, paths.userDataFile) })));
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL, paths: StudyPaths) {
  const pathname = url.pathname;
  if (pathname === "/api/study/current") return reply(res, 200, await current(paths));
  if (pathname === "/api/study/modules") return reply(res, 200, (await getStudyBankSummary(paths.questionBankFile)).modules.map(({ module }) => module));
  if (pathname === "/api/study/users") return reply(res, 200, { users: await listUsers(paths.userDataFile), activeUser: await getActiveUser(paths.userDataFile) });
  const data = req.method === "POST" ? await readBody(req) : {};
  if (pathname === "/api/study/user") {
    const user = await createUser({ nickname: String(data.nickname ?? "") }, paths.userDataFile);
    await setActiveUser(user.id, paths.userDataFile);
    return reply(res, 201, { user });
  }
  if (pathname === "/api/study/user/active") {
    await setActiveUser(String(data.userId ?? ""), paths.userDataFile);
    return reply(res, 200, await current(paths));
  }
  const user = await getActiveUser(paths.userDataFile);
  if (!user) throw new Error("请先创建学习档案");
  const base = { userId: user.id, userDataFile: paths.userDataFile, questionBankFile: paths.questionBankFile };
  if (pathname === "/api/study/status") return reply(res, 200, await learningStatus(user.id, paths, url.searchParams.get("range") ?? "7d"));
  if (pathname === "/api/study/bank-summary") return reply(res, 200, await getStudyBankSummary(paths.questionBankFile));
  if (pathname === "/api/study/history") return reply(res, 200, { sessions: await history(user.id, paths) });
  if (pathname === "/api/study/wrong-questions") return reply(res, 200, { questionExternalIds: await getWrongQuestionIds(user.id, paths.userDataFile) });
  if (pathname === "/api/study/wrong-review/start") { const process = startWrongReview(user.id); return reply(res, 200, await wrongReviewCurrent(user.id, process.id, paths)); }
  if (pathname === "/api/study/wrong-review/forward") return reply(res, 200, await wrongReviewCurrent(user.id, String(data.reviewId ?? ""), paths));
  if (pathname === "/api/study/wrong-review/leave") { clearWrongReview(user.id, String(data.reviewId ?? "")); return reply(res, 200, { ok: true }); }
  if (pathname === "/api/study/wrong-review/submit") {
    requireWrongReview(user.id, String(data.reviewId ?? ""));
    const result = await submitWrongReviewAnswer({ ...base, questionExternalId: String(data.questionExternalId ?? ""), selectedAnswer: String(data.selectedAnswer ?? ""), submissionId: String(data.submissionId ?? ""), cumulativeAnswerDuration: Number(data.answerDuration ?? 0) });
    return reply(res, 200, { submittedAnswer: result.attempt.submittedAnswer, isCorrect: result.isCorrect, correctAnswer: result.correctAnswer, explanation: result.explanation });
  }
  if (pathname === "/api/study/wrong-questions/remove") { await removeWrongQuestion(user.id, String(data.questionExternalId ?? ""), paths.userDataFile); return reply(res, 200, { questionExternalIds: await getWrongQuestionIds(user.id, paths.userDataFile) }); }
  if (pathname === "/api/study/history/invalidate") { const session = await getSession(String(data.sessionId ?? ""), paths.userDataFile); if (session.userId !== user.id) throw new Error("不能撤销其他学习档案的训练"); await invalidateSession(session.id, paths.userDataFile); return reply(res, 200, { sessions: await history(user.id, paths), status: await learningStatus(user.id, paths, "all") }); }
  if (pathname === "/api/study/start") {
    await createPlannedSession({ ...base, type: "normal" });
    return reply(res, 200, await current(paths));
  }
  if (pathname === "/api/study/submit") {
    const result = await submitCurrentAnswer({ ...base, selectedAnswer: String(data.selectedAnswer ?? ""), submissionId: String(data.submissionId ?? ""), cumulativeAnswerDuration: Number(data.answerDuration ?? 0) });
    return reply(res, 200, { submittedAnswer: result.attempt.submittedAnswer, isCorrect: result.isCorrect, correctAnswer: result.correctAnswer, explanation: result.explanation });
  }
  if (pathname === "/api/study/forward") {
    await forwardCurrent(base);
    return reply(res, 200, await current(paths));
  }
  if (pathname === "/api/study/refresh") {
    await refreshSession(base);
    return reply(res, 200, await current(paths));
  }
  if (pathname === "/api/study/special") {
    const existing = await resumeSession(base);
    if (existing && !data.replaceCurrent) return reply(res, 409, { error: "当前有进行中的训练，请确认替换" });
    const plan = await generateSessionPlan({ ...base, type: "special", module: String(data.module ?? ""), previousSessionId: existing?.session.id });
    if (existing) await replaceOngoingSession({ userId: user.id, oldSessionId: existing.session.id, type: plan.type, questionExternalIds: plan.questionExternalIds }, paths.userDataFile);
    else await createPlannedSession({ ...base, type: "special", module: String(data.module ?? "") });
    return reply(res, 200, await current(paths));
  }
  return reply(res, 404, { error: "Not found" });
}

export function createStudyServer(options: StudyServerOptions) {
  const paths: StudyPaths = { ...options, webRoot: options.webRoot ?? path.join(process.cwd(), "src", "web") };
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost"); const pathname = url.pathname;
      const staticFile = pathname === "/" ? "index.html" : pathname.slice(1);
      if (["index.html", "app.js", "app.css", "pull-state.js"].includes(staticFile)) {
        const type = staticFile.endsWith(".css") ? "text/css; charset=utf-8" : staticFile.endsWith(".js") ? "application/javascript; charset=utf-8" : "text/html; charset=utf-8";
        return reply(res, 200, await fs.readFile(path.join(paths.webRoot, staticFile), "utf8"), type);
      }
      if (pathname.startsWith("/api/study/")) return await handleApi(req, res, url, paths);
      return reply(res, 404, { error: "Not found" });
    } catch (error) { return reply(res, 400, { error: error instanceof Error ? error.message : "操作失败" }); }
  });
}

async function main() {
  await initializeApplicationData();
  createStudyServer({ userDataFile, questionBankFile }).listen(Number(process.env.PORT ?? 3000));
}

if (require.main === module) void main();

