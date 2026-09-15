import assert from "node:assert/strict";
import { adaptFei98Question, normalizeOptionKey } from "../src/lib/sources/fei98.ts";

const raw = { id: "imp-test-001", category: "资料分析", type: "single", stem: " <b>测试题干</b> ", options: { a: " 甲 ", B: "乙", C: "丙", D: "丁" }, answer: " a ", explanation: " <p>解析</p> ", sourceMeta: { year: "2024", province: "浙江", section: "资料分析" }, pitfallTags: ["资料-增长率"], difficulty: 3, reviewed: true, images: ["https://example.org/image.png"] };
const first = adaptFei98Question(raw); const second = adaptFei98Question(raw);
assert.ok(first.question); assert.deepEqual(first.question, second.question);
const question = first.question as { externalId: string; content: { stem: string; options: { key: string }[]; correctAnswer: string[] }; classification: { module: string; knowledgePointExternalIds: string[] }; provenance: { content: { originalId: string } } };
assert.equal(question.externalId, "fei98-imp-test-001"); assert.equal(question.content.stem, "测试题干"); assert.deepEqual(question.content.options.map((item) => item.key), ["A", "B", "C", "D"]); assert.deepEqual(question.content.correctAnswer, ["A"]); assert.equal(question.classification.module, "资料分析"); assert.deepEqual(question.classification.knowledgePointExternalIds, ["kp-data-analysis"]); assert.equal(question.provenance.content.originalId, "imp-test-001"); assert.equal(first.media.length, 1);
assert.equal(adaptFei98Question({ ...raw, answer: "Z" }).rejected, "answer does not reference a usable option");
assert.equal(normalizeOptionKey(" （ａ、） "), "A");
assert.equal(normalizeOptionKey("A. "), "A");
assert.equal(normalizeOptionKey("A,B"), null);
assert.equal(adaptFei98Question({ ...raw, options: { A: "甲", "Ａ": "乙" } }).rejected, "duplicate normalized option key");
assert.equal(adaptFei98Question({ ...raw, options: null }).rejected, "options is not an object");
console.log("Fei98 adapter tests: PASS");
