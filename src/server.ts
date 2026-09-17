import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { initializeApplicationData, questionBankFile, userDataFile } from "./lib/app-data.js";
import { createUser, getActiveUser, getLatestSession, listUsers, replaceOngoingSession, setActiveUser } from "./lib/user-data.js";
import { createPlannedSession, generateSessionPlan } from "./lib/session-planner.js";
import { forwardCurrent, getCompletionStats, refreshSession, resumeSession, submitCurrentAnswer } from "./lib/session-runner.js";
import { getStudyBankSummary } from "./lib/study-question-bank.js";

export type StudyServerOptions = { userDataFile: string; questionBankFile: string; webRoot?: string };
type StudyPaths = Required<StudyServerOptions>;

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

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, paths: StudyPaths) {
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
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      const staticFile = pathname === "/" ? "index.html" : pathname.slice(1);
      if (["index.html", "app.js", "app.css"].includes(staticFile)) {
        const type = staticFile.endsWith(".css") ? "text/css; charset=utf-8" : staticFile.endsWith(".js") ? "application/javascript; charset=utf-8" : "text/html; charset=utf-8";
        return reply(res, 200, await fs.readFile(path.join(paths.webRoot, staticFile), "utf8"), type);
      }
      if (pathname.startsWith("/api/study/")) return handleApi(req, res, pathname, paths);
      return reply(res, 404, { error: "Not found" });
    } catch (error) { return reply(res, 400, { error: error instanceof Error ? error.message : "操作失败" }); }
  });
}

async function main() {
  await initializeApplicationData();
  createStudyServer({ userDataFile, questionBankFile }).listen(Number(process.env.PORT ?? 3000));
}

if (require.main === module) void main();
