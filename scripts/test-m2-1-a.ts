import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendAttempt, createSession, createUser, getAttempts, getLearningState, getSession, getSessionQuestions, getLastUser, initializeUserData, invalidateSession, listUsers, removeWrongQuestion, setLastUser, advanceSession } from "../src/lib/user-data.ts";

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gongkao-m2-1-a-"));
  const file = path.join(root, "user-data.db");
  await initializeUserData(file);
  const alice = await createUser({ nickname: "Alice" }, file);
  const bob = await createUser({ nickname: "Bob" }, file);
  assert.equal((await listUsers(file)).length, 2);
  await setLastUser(alice.id, file);
  assert.equal((await getLastUser(file))?.id, alice.id);

  const session = await createSession({ userId: alice.id, type: "normal", questionExternalIds: ["A", "B", "C"] }, file);
  await assert.rejects(createSession({ userId: alice.id, type: "normal", questionExternalIds: ["X"] }, file));
  const bobSession = await createSession({ userId: bob.id, type: "special", questionExternalIds: ["A"] }, file);
  assert.equal(bobSession.status, "in_progress");
  assert.deepEqual((await getSessionQuestions(session.id, file)).map((q) => q.questionExternalId), ["A", "B", "C"]);
  await advanceSession(session.id, "A", file);
  await advanceSession(session.id, "B", file);
  await advanceSession(session.id, "C", file);
  assert.equal((await getSession(session.id, file)).status, "completed");
  assert.equal((await getSession(session.id, file)).traversedQuestionCount, 3);
  assert.equal((await getSession(session.id, file)).answeredQuestionCount, 0);

  const wrong = await appendAttempt({ userId: alice.id, questionExternalId: "A", submittedAnswer: "X", isCorrect: false, cumulativeAnswerDuration: 12, sessionId: null, learningContext: "wrongReview" }, file);
  assert.ok(wrong.id);
  assert.equal((await getLearningState(alice.id, "A", file))?.isWrong, true);
  await removeWrongQuestion(alice.id, "A", file);
  assert.equal((await getLearningState(alice.id, "A", file))?.isWrong, false);
  const unrelated = await createSession({ userId: alice.id, type: "special", questionExternalIds: ["Z"] }, file);
  await appendAttempt({ userId: alice.id, questionExternalId: "Z", submittedAnswer: "X", isCorrect: false, cumulativeAnswerDuration: 1, sessionId: unrelated.id, learningContext: "special" }, file);
  assert.equal((await getLearningState(alice.id, "Z", file))?.isWrong, true);
  await invalidateSession(unrelated.id, file);
  assert.equal((await getLearningState(alice.id, "Z", file))?.isWrong, false);
  assert.equal((await getLearningState(alice.id, "A", file))?.isWrong, false);
  await appendAttempt({ userId: alice.id, questionExternalId: "A", submittedAnswer: "Y", isCorrect: false, cumulativeAnswerDuration: 3, sessionId: null, learningContext: "wrongReview" }, file);
  assert.equal((await getLearningState(alice.id, "A", file))?.isWrong, true);
  await appendAttempt({ userId: alice.id, questionExternalId: "A", submittedAnswer: "OK", isCorrect: true, cumulativeAnswerDuration: 3, sessionId: null, learningContext: "wrongReview" }, file);
  assert.equal((await getLearningState(alice.id, "A", file))?.isWrong, false);
  assert.equal((await getAttempts(file, alice.id)).length, 4);
  assert.equal((await getAttempts(file, bob.id)).length, 0);
  await initializeUserData(file);
  assert.equal((await listUsers(file)).length, 2);
  assert.equal((await getAttempts(file, alice.id)).length, 4);
  console.log("M2.1-A tests: PASS");
}
void main();
