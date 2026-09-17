import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createStudyServer } from "../src/server.ts";
import { appendAttempt, createSession, createUser, endSessionEarly, getAttempts, getLearningState, initializeUserData, invalidateSession, removeWrongQuestion } from "../src/lib/user-data.ts";
import { getStudyQuestion, importQuestionBankV1 } from "../src/lib/study-question-bank.ts";

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gongkao-m2-2-c3-"));
  const userDataFile = path.join(root, "user.db"), questionBankFile = path.join(root, "bank.db");
  await initializeUserData(userDataFile);
  await importQuestionBankV1(JSON.parse(await fs.readFile(path.join(process.cwd(), "fixtures", "import-trials", "fei98", "question-bank-v1.json"), "utf8")), questionBankFile);
  const server = createStudyServer({ userDataFile, questionBankFile }); server.listen(0); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string"); const base = `http://127.0.0.1:${address.port}`;
  const request = async (pathname: string, method = "GET", body?: unknown) => { const response = await fetch(`${base}${pathname}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); return { status: response.status, body: await response.json() as Record<string, any> }; };
  try {
    const a = (await request("/api/study/user", "POST", { nickname: "A" })).body.user;
    const started = await request("/api/study/start", "POST", {}); const qid = started.body.question.externalId;
    const question = await getStudyQuestion(qid, questionBankFile); assert.ok(question); const wrong = question.options.find(x => !question.correctAnswer.includes(x.key))!.key;
    await request("/api/study/submit", "POST", { selectedAnswer: wrong, submissionId: "normal-wrong", answerDuration: 11 });
    const review = await request("/api/study/wrong-review/start", "POST", {});
    assert.equal(review.body.state, "review"); assert.equal(review.body.question.externalId, qid, "recently entered wrong question is reviewed first");
    const beforeReview = (await getAttempts(userDataFile, a.id)).length;
    const emptyAdvance = await request("/api/study/wrong-review/forward", "POST", {});
    assert.equal((await getAttempts(userDataFile, a.id)).length, beforeReview, "unanswered review forward makes no attempt");
    assert.equal(emptyAdvance.body.state, "review_completed", "seen review question is not immediately repeated");
    const reviewAgain = await request("/api/study/wrong-review/start", "POST", {});
    const correct = question.correctAnswer[0]; await request("/api/study/wrong-review/submit", "POST", { questionExternalId: reviewAgain.body.question.externalId, selectedAnswer: correct, submissionId: "review-correct", answerDuration: 4 });
    assert.equal((await getLearningState(a.id, qid, userDataFile))?.isWrong, false, "correct review removes wrong state");
    const reviewAttempt = (await getAttempts(userDataFile, a.id)).find(x => x.submissionId === "review-correct")!;
    assert.equal(reviewAttempt.sessionId, null); assert.equal(reviewAttempt.learningContext, "wrongReview");
    const history = await request("/api/study/history"); assert.equal(history.body.sessions.length, 1, "wrong review creates no session history");
    await invalidateSession((await getAttempts(userDataFile, a.id)).find(x => x.submissionId === "normal-wrong")!.sessionId!, userDataFile);
    const s = await createSession({ userId: a.id, type: "special", questionExternalIds: [qid] }, userDataFile);
    await appendAttempt({ userId: a.id, questionExternalId: qid, submittedAnswer: wrong, isCorrect: false, cumulativeAnswerDuration: 2, sessionId: s.id, learningContext: "special", submissionId: "later-wrong" }, userDataFile);
    await removeWrongQuestion(a.id, qid, userDataFile); await endSessionEarly(s.id, userDataFile); const unrelated = await createSession({ userId: a.id, type: "normal", questionExternalIds: ["other"] }, userDataFile); await invalidateSession(unrelated.id, userDataFile);
    assert.equal((await getLearningState(a.id, qid, userDataFile))?.isWrong, false, "manual removal survives unrelated invalidation and recalculation");
    await appendAttempt({ userId: a.id, questionExternalId: qid, submittedAnswer: wrong, isCorrect: false, cumulativeAnswerDuration: 3, sessionId: null, learningContext: "wrongReview", submissionId: "wrong-again" }, userDataFile);
    assert.equal((await getLearningState(a.id, qid, userDataFile))?.isWrong, true, "a later wrong answer re-enters the wrong book");
    const all = await request("/api/study/status?range=all"), d7 = await request("/api/study/status?range=7d"); assert.equal(all.body.answeredCount, d7.body.answeredCount); assert.ok(all.body.answerDuration >= 9, "effective attempts drive duration statistics");
    await invalidateSession(s.id, userDataFile); const afterInvalidation = await request("/api/study/status?range=all"); assert.equal(afterInvalidation.body.answeredCount, 2, "invalidated session attempts do not count"); assert.equal((await getLearningState(a.id, qid, userDataFile))?.isWrong, true, "remaining valid wrong review attempt still determines learning state");
    const b = await createUser({ nickname: "B" }, userDataFile); assert.equal((await getAttempts(userDataFile, b.id)).length, 0); assert.equal((await getLearningState(b.id, qid, userDataFile)), undefined, "users remain isolated"); await request("/api/study/user/active", "POST", { userId: b.id }); assert.equal((await request("/api/study/history/invalidate", "POST", { sessionId: s.id })).status, 400, "a user cannot invalidate another user's session");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  console.log("M2.2-C3 tests: PASS");
}
void main();
