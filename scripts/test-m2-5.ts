import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildLearningTrend, createStudyServer } from "../src/server.ts";
import { appendAttempt, createSession, endSessionEarly, initializeUserData, invalidateSession, type Attempt } from "../src/lib/user-data.ts";
import { importQuestionBankV1 } from "../src/lib/study-question-bank.ts";

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gongkao-m2-5-"));
  const userDataFile = path.join(root, "user.db"), questionBankFile = path.join(root, "bank.db");
  await initializeUserData(userDataFile);
  await importQuestionBankV1(JSON.parse(await fs.readFile(path.join(process.cwd(), "fixtures", "import-trials", "fei98", "question-bank-v1.json"), "utf8")), questionBankFile);
  const server = createStudyServer({ userDataFile, questionBankFile }); server.listen(0); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}`;
  const request = async (pathname: string, method = "GET", body?: unknown) => { const response = await fetch(`${base}${pathname}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); return { status: response.status, body: await response.json() as Record<string, any> }; };
  try {
    const user = (await request("/api/study/user", "POST", { nickname: "A" })).body.user;
    const valid = await createSession({ userId: user.id, type: "special", questionExternalIds: ["Q1"] }, userDataFile);
    await appendAttempt({ userId: user.id, questionExternalId: "Q1", submittedAnswer: "A", isCorrect: true, cumulativeAnswerDuration: 10, sessionId: valid.id, learningContext: "special", submissionId: "valid-correct" }, userDataFile); await endSessionEarly(valid.id, userDataFile);
    await appendAttempt({ userId: user.id, questionExternalId: "Q2", submittedAnswer: "B", isCorrect: false, cumulativeAnswerDuration: 20, sessionId: null, learningContext: "wrongReview", submissionId: "review-wrong" }, userDataFile);
    const invalid = await createSession({ userId: user.id, type: "normal", questionExternalIds: ["Q3"] }, userDataFile);
    await appendAttempt({ userId: user.id, questionExternalId: "Q3", submittedAnswer: "C", isCorrect: false, cumulativeAnswerDuration: 999, sessionId: invalid.id, learningContext: "normal", submissionId: "invalid-wrong" }, userDataFile); await invalidateSession(invalid.id, userDataFile);
    const all = await request("/api/study/status?range=all"); const d7 = await request("/api/study/status?range=7d"); const defaultRange = await request("/api/study/status"); assert.equal(defaultRange.body.range, "7d", "learning status defaults to 7D");
    for (const status of [all, d7]) { assert.equal(status.status, 200); assert.equal(status.body.answeredCount, 2); assert.equal(status.body.correctCount, 1); assert.equal(status.body.accuracy, .5); assert.equal(status.body.answerDuration, 30); assert.equal(status.body.averageAnswerDuration, 15); assert.equal(status.body.wrongCountCurrent, 1); assert.equal(status.body.currentTraining.state, "ready"); assert.equal("correctAnswer" in status.body, false, "status API must not leak answers"); }
    assert.equal(d7.body.trend.granularity, "day"); assert.equal(d7.body.trend.points.length, 7); assert.equal(d7.body.trend.points.reduce((sum: number, point: { answeredCount: number }) => sum + point.answeredCount, 0), 2, "7D trend uses effective attempts");
    const started = await request("/api/study/start", "POST", {}); assert.equal(started.status, 200); const ongoing = await request("/api/study/status?range=7d"); assert.equal(ongoing.body.currentTraining.state, "ongoing", "status exposes resumable training without question answers");
    const b = (await request("/api/study/user", "POST", { nickname: "B" })).body.user; assert.ok(b.id); const isolated = await request("/api/study/status?range=all"); assert.equal(isolated.body.answeredCount, 0); assert.equal(isolated.body.wrongCountCurrent, 0); assert.equal(isolated.body.currentTraining.state, "ready", "statistics and training state are isolated by user");
    const now = Date.UTC(2026, 8, 17); const synthetic = [0, 12, 40].map((days, index) => ({ id: String(index), submissionId: null, userId: "trend", questionExternalId: `T${index}`, submittedAnswer: "A", isCorrect: index !== 1, submittedAt: new Date(now - days * 86400000).toISOString(), cumulativeAnswerDuration: 1, sessionId: null, learningContext: "wrongReview" as const } satisfies Attempt));
    const allTrend = buildLearningTrend(synthetic, "all", now); assert.equal(allTrend.granularity, "week", "ALL uses a reasonable weekly granularity for multi-week data"); assert.equal(allTrend.points.reduce((sum, point) => sum + point.answeredCount, 0), 3);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  console.log("M2.5 tests: PASS");
}
void main();
