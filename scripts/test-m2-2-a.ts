import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createUser, endSessionEarly, getSessionQuestions, initializeUserData } from "../src/lib/user-data.ts";
import { importQuestionBankV1 } from "../src/lib/study-question-bank.ts";
import { createPlannedSession } from "../src/lib/session-planner.ts";

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gongkao-m2-2-a-"));
  const userFile = path.join(root, "user-data.db"), bankFile = path.join(root, "question-bank.db");
  const bank = JSON.parse(await fs.readFile(path.join(process.cwd(), "fixtures/import-trials/fei98/question-bank-v1.json"), "utf8"));
  await initializeUserData(userFile); await importQuestionBankV1(bank, bankFile);
  const a = await createUser({ nickname: "A" }, userFile), b = await createUser({ nickname: "B" }, userFile), c = await createUser({ nickname: "C" }, userFile);
  const normal = await createPlannedSession({ userId: a.id, type: "normal", userDataFile: userFile, questionBankFile: bankFile, random: () => .1 });
  assert.equal(normal.created, true); assert.equal(normal.session.plannedQuestionCount, 20);
  const ids = await getSessionQuestions(normal.session.id, userFile); assert.equal(ids.length, 20);
  assert.equal((await createPlannedSession({ userId: a.id, type: "normal", userDataFile: userFile, questionBankFile: bankFile })).session.id, normal.session.id);
  await endSessionEarly(normal.session.id, userFile);
  const special = await createPlannedSession({ userId: a.id, type: "special", module: "判断推理", userDataFile: userFile, questionBankFile: bankFile });
  assert.equal(special.session.plannedQuestionCount, 10);
  assert.equal((await createPlannedSession({ userId: b.id, type: "special", module: "判断推理", userDataFile: userFile, questionBankFile: bankFile })).created, true);
  await assert.rejects(createPlannedSession({ userId: c.id, type: "special", module: "不存在", userDataFile: userFile, questionBankFile: bankFile }));
  await initializeUserData(userFile); assert.deepEqual((await getSessionQuestions(special.session.id, userFile)).map(q => q.questionExternalId), (await getSessionQuestions(special.session.id, userFile)).map(q => q.questionExternalId));
  console.log("M2.2-A tests: PASS");
}
void main();
