import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { importQuestionBankV1, getStudyBankSummary, getStudyQuestion } from "../src/lib/study-question-bank.ts";
import { initializeUserData, getAttempts, saveAttempt } from "../src/lib/user-data.ts";

async function main() { const root = await fs.mkdtemp(path.join(os.tmpdir(), "gongkao-v1-m1-")); const bankFile = path.join(root, "question-bank.db"); const userFile = path.join(root, "user-data.db"); const bank = JSON.parse(await fs.readFile(path.join(process.cwd(), "fixtures/import-trials/fei98/question-bank-v1.json"), "utf8")); await importQuestionBankV1(bank, bankFile); await initializeUserData(userFile); const summary = await getStudyBankSummary(bankFile); assert.equal(summary.questions, 50); assert.deepEqual(summary.modules.map((m) => m.count), [10, 10, 10, 10, 10]); const question = await getStudyQuestion("fei98-imp-58b5206d85fd", bankFile); assert.ok(question?.options.length); const attempt = await saveAttempt({ questionExternalId: question!.externalId, selectedAnswer: "D", isCorrect: true }, userFile); assert.equal(attempt.questionExternalId, question!.externalId); assert.equal((await getAttempts(userFile)).length, 1); await fs.rm(bankFile); await importQuestionBankV1(bank, bankFile); assert.equal((await getAttempts(userFile))[0].questionExternalId, question!.externalId); console.log("M1 tests: PASS"); }
void main();
