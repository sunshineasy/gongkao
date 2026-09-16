import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getRandomStudyQuestions, getStudyBankSummary, getStudyQuestion, getStudyQuestionsByModule, importQuestionBankV1 } from "../src/lib/study-question-bank.ts";

async function main() { const root = await fs.mkdtemp(path.join(os.tmpdir(), "gongkao-import-")); const db = path.join(root, "study.db"); const bank = JSON.parse(await fs.readFile(path.resolve(process.cwd(), "fixtures/import-trials/fei98/question-bank-v1.json"), "utf8"));
  assert.deepEqual(await importQuestionBankV1(bank, db), { imported: true, questions: 50 }); assert.deepEqual(await importQuestionBankV1(bank, db), { imported: false, questions: 0 }); const summary = await getStudyBankSummary(db); assert.equal(summary.questions, 50); assert.equal(summary.options, 200); assert.equal(summary.knowledgePoints, 5); assert.equal(summary.materials, 0); assert.deepEqual(summary.modules.map((item) => item.count), [10, 10, 10, 10, 10]); const ids = await getStudyQuestionsByModule("判断推理", db); assert.equal(ids.length, 10); const question = await getStudyQuestion(ids[0], db); assert.ok(question); assert.equal(question.options.length, 4); assert.equal(question.knowledgePoints.length, 1); assert.equal(question.correctAnswer.length, 1); const imageQuestion = await getStudyQuestion("fei98-imp-e8e36a7d2e0f", db); assert.ok(imageQuestion?.media.length); assert.equal((await getRandomStudyQuestions(5, db)).length, 5); console.log("Study V1 importer tests: PASS", summary); }
void main();
