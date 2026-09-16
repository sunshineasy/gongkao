import fs from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import { adaptFei98Question, fei98KnowledgePoints, normalizeOptionKey } from "../src/lib/sources/fei98.ts";
import { validateQuestionBank } from "../src/lib/question-bank.ts";

const categories = ["常识判断", "言语理解", "数量关系", "判断推理", "资料分析"];
type Raw = { category?: string; type?: string; options?: unknown; answer?: unknown; stem?: unknown };
const count = (record: Record<string, number>, key: string) => { record[key] = (record[key] ?? 0) + 1; };
function issueCodes(raw: Raw) {
  const issues: string[] = [];
  if (raw.type !== "single") issues.push("unsupportedType");
  if (!raw.stem || !String(raw.stem).trim()) issues.push("missingStem");
  if (!raw.options || typeof raw.options !== "object" || Array.isArray(raw.options)) issues.push("optionsMissingOrInvalid");
  else {
    const entries = Object.entries(raw.options as Record<string, unknown>); const keys = entries.map(([key]) => normalizeOptionKey(key));
    if (keys.some((key) => !key)) issues.push("invalidOptionKey"); if (new Set(keys.filter(Boolean)).size !== keys.filter(Boolean).length) issues.push("duplicateOptionKey"); if (entries.some(([, text]) => !String(text ?? "").trim())) issues.push("missingOptionText");
    const answer = normalizeOptionKey(raw.answer); if (!answer || !keys.includes(answer)) issues.push(typeof raw.answer === "string" && raw.answer.includes(",") ? "multiValueAnswer" : "invalidAnswer");
  }
  return issues;
}
async function downloadMedia(media: Record<string, unknown>[], outputDir: string) {
  const stats = { mediaReferenced: media.length, mediaDownloadAttempted: 0, mediaDownloaded: 0, mediaFailed: 0, mediaNeedsReview: 0 }; const warnings: string[] = []; const failedQuestionIds = new Set<string>();
  await fs.mkdir(outputDir, { recursive: true });
  for (const item of media) { stats.mediaDownloadAttempted++; const url = item.url as string; const filename = path.basename(item.path as string); try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) }); const contentType = response.headers.get("content-type") ?? ""; const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok || !contentType.startsWith("image/") || bytes.length === 0 || bytes.length > 10 * 1024 * 1024) throw new Error(`status=${response.status}; contentType=${contentType}; bytes=${bytes.length}`);
    await fs.writeFile(path.join(outputDir, filename), bytes); stats.mediaDownloaded++;
  } catch (error) { stats.mediaFailed++; stats.mediaNeedsReview++; const match = String(item.externalId).match(/^fei98-media-/); if (match) failedQuestionIds.add(String(item.externalId)); warnings.push(`${item.externalId}: media download failed: ${error instanceof Error ? error.message : String(error)}`); } }
  return { stats, warnings, failedQuestionIds };
}
async function main() {
  const sourcePath = process.argv[2]; if (!sourcePath) throw new Error("用法：tsx scripts/import-fei98-trial.ts <fei98 questions.json>");
  const outputDir = path.resolve(process.cwd(), "fixtures/import-trials/fei98"); const raw = JSON.parse(await fs.readFile(sourcePath, "utf8")) as Raw[]; if (!Array.isArray(raw)) throw new Error("fei98 source must be a JSON array");
  const issues: Record<string, number> = {}; raw.forEach((record) => issueCodes(record).forEach((issue) => count(issues, issue)));
  const selected: Record<string, unknown>[] = []; const media: Record<string, unknown>[] = []; const rejectedRecords = raw.filter((record) => issueCodes(record).length > 0).length;
  for (const category of categories) { let added = 0; for (const record of raw) { if (record.category !== category || added === 10) continue; const result = adaptFei98Question(record); if (!result.question) continue; selected.push(result.question); media.push(...result.media); added++; } if (added !== 10) throw new Error(`${category} has only ${added} usable questions`); }
  const mediaResult = await downloadMedia(media, path.join(outputDir, "media")); const failedMediaIds = new Set(media.filter((item) => mediaResult.warnings.some((warning) => warning.startsWith(`${item.externalId}:`))).map((item) => item.externalId));
  const questionsNeedingReview = selected.filter((question) => ((question.content as { media: string[] }).media ?? []).some((id) => failedMediaIds.has(id))).map((question) => question.externalId);
  const bank = { schemaVersion: "1.0", bankId: "fei98-trial", bankVersion: "2026.09.15.2", name: "fei98 50-question import trial", description: "Generated from a pinned real source snapshot; not a production question bank.", exportedAt: new Date().toISOString(), publisher: "gongkao fei98 adapter", questions: selected, materials: [], knowledgePoints: fei98KnowledgePoints, media };
  const schema = JSON.parse(await fs.readFile(path.resolve(process.cwd(), "schemas/question-bank-v1.schema.json"), "utf8")); const schemaValid = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: "ignore" }).validate(schema, bank); const crossObject = validateQuestionBank(bank);
  const distribution = Object.fromEntries(categories.map((category) => [category, selected.filter((item) => (item.classification as { module: string }).module === ({ "言语理解": "言语理解与表达" }[category] ?? category)).length]));
  const report = { source: "fei98/civil-service-exam-prep", adapterVersion: "2.0.0", schemaVersion: "1.0", sourceCommit: process.env.FEI98_SOURCE_COMMIT ?? null, records: { sourceRecords: raw.length, supportedTypeRecords: raw.filter((record) => record.type === "single").length, unsupportedTypeRecords: raw.filter((record) => record.type !== "single").length, structurallyValidRecords: raw.filter((record) => issueCodes(record).length === 0).length, structurallyInvalidRecords: rejectedRecords, candidateRecords: raw.filter((record) => issueCodes(record).length === 0).length, sampledRecords: selected.length, convertedRecords: selected.length, validRecords: schemaValid && crossObject.errors.length === 0 ? selected.length : 0, needsReviewRecords: questionsNeedingReview.length, rejectedRecords, duplicateRecords: 0 }, issueCounts: issues, moduleDistribution: distribution, materials: 0, media: mediaResult.stats, questionsWithoutAnalysis: selected.filter((item) => !(item.content as { explanation: unknown }).explanation).length, questionsWithoutPaperContext: selected.filter((item) => !(item.paperContext as { year: unknown }).year).length, schemaValidation: schemaValid ? "PASS" : "FAIL", crossObjectValidation: crossObject.errors.length ? "FAIL" : "PASS", needsReviewQuestionIds: questionsNeedingReview, warnings: mediaResult.warnings, errors: crossObject.errors, sourceFieldNotes: ["sourceType is captured as provenance context, not copied as a source-specific enum", "current source has no chart field and no reliable shared material relationship"] };
  await fs.mkdir(outputDir, { recursive: true }); await fs.writeFile(path.join(outputDir, "question-bank-v1.json"), `${JSON.stringify(bank, null, 2)}\n`); await fs.writeFile(path.join(outputDir, "import-report.json"), `${JSON.stringify(report, null, 2)}\n`); if (!schemaValid || crossObject.errors.length) process.exitCode = 1;
}
void main();
