import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeQuestionText, toMediaPublicPath } from "../src/lib/question-text.ts";
import { getStudyQuestion, importQuestionBankV1 } from "../src/lib/study-question-bank.ts";

async function main() {
  assert.equal(normalizeQuestionText("&emsp;A&nbsp;&amp; B&lt;br&gt;<p>C&#x4E2D;&#25991;</p>"), "A & B\nC中文");
  assert.equal(toMediaPublicPath("media/chart one.png"), "/media/media/chart%20one.png");
  assert.throws(() => toMediaPublicPath("../secret.png"));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gongkao-v1-m11-")); const file = path.join(root, "question-bank.db");
  const bank = JSON.parse(await fs.readFile(path.join(process.cwd(), "fixtures/import-trials/fei98/question-bank-v1.json"), "utf8")); await importQuestionBankV1(bank, file);
  const entityQuestion = await getStudyQuestion("fei98-imp-00f72bc22389", file); assert.ok(entityQuestion); assert.ok(!entityQuestion.stem.includes("&emsp;"));
  const mediaQuestion = await getStudyQuestion("fei98-imp-81b41cd5c586", file); assert.equal(mediaQuestion?.media.length, 2); for (const item of mediaQuestion?.media ?? []) assert.ok(await fs.stat(path.join(process.cwd(), "fixtures/import-trials/fei98", item.path)));
  assert.equal(mediaQuestion?.options.flatMap((option) => option.media).length, 0);
  const original = bank.questions.find((item: { externalId: string }) => item.externalId === "fei98-imp-81b41cd5c586"); assert.equal(mediaQuestion?.explanation, normalizeQuestionText(original.content.explanation));
  const sampled = ["fei98-imp-4ae4d6361c05", "fei98-imp-ad85c02fddfc", "fei98-imp-81b41cd5c586", "fei98-imp-83d4da9641b2", "fei98-imp-9c17a462dff7", "fei98-imp-c7b0434d0f87", "fei98-imp-58b5206d85fd", "fei98-imp-e8e36a7d2e0f", "fei98-imp-00f72bc22389", "fei98-imp-a5f8f9bb311e", "fei98-imp-5df34152261c", "fei98-imp-89bcb4c7ed01", "fei98-imp-f02f183b7851"];
  for (const id of sampled) assert.ok(await getStudyQuestion(id, file));
  console.log("M1.1 tests: PASS (13 real questions sampled)");
}
void main();
