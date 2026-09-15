import crypto from "node:crypto";

type RawQuestion = { id?: unknown; category?: unknown; type?: unknown; stem?: unknown; options?: unknown; answer?: unknown; explanation?: unknown; sourceType?: unknown; sourceMeta?: unknown; pitfallTags?: unknown; difficulty?: unknown; reviewed?: unknown; images?: unknown };
type SourceRef = { provider: string; sourceType: "REAL_EXAM"; sourceName: string; sourceUrl: string; originalId: string; sourceRecordId: null; sourceFile: string; sourcePage: null; credibility: "B"; license: string; copyrightNote: string };
export type Fei98Result = { question?: Record<string, unknown>; media: Record<string, unknown>[]; warning?: string; rejected?: string };

const modules: Record<string, { name: string; knowledgePointExternalId: string }> = {
  "常识判断": { name: "常识判断", knowledgePointExternalId: "kp-common-sense" }, "言语理解": { name: "言语理解与表达", knowledgePointExternalId: "kp-verbal" }, "数量关系": { name: "数量关系", knowledgePointExternalId: "kp-quantitative" }, "判断推理": { name: "判断推理", knowledgePointExternalId: "kp-reasoning" }, "资料分析": { name: "资料分析", knowledgePointExternalId: "kp-data-analysis" },
};
export const fei98KnowledgePoints = Object.values(modules).map((item) => ({ externalId: item.knowledgePointExternalId, name: item.name, parentExternalId: null, level: 1, type: "MODULE" }));

const clean = (value: unknown) => typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || null : null;
export function normalizeOptionKey(value: unknown) {
  const raw = clean(value)?.replace(/[Ａ-Ｚａ-ｚ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xFEE0)).toUpperCase();
  const match = raw?.match(/^[（(【[]?\s*([A-Z])(?:\s*[.、:：])?\s*[）)】\]]?$/);
  return match?.[1] ?? null;
}
const source = (id: string): SourceRef => ({ provider: "fei98/civil-service-exam-prep", sourceType: "REAL_EXAM", sourceName: "fei98 structured question bank", sourceUrl: "https://github.com/fei98/civil-service-exam-prep", originalId: id, sourceRecordId: null, sourceFile: "questions/questions.json", sourcePage: null, credibility: "B", license: "AGPL-3.0 upstream data notice", copyrightNote: "Question text and analysis rights belong to original rightsholders; personal study use only." });
const mediaId = (id: string, index: number) => `fei98-media-${crypto.createHash("sha256").update(`${id}:${index}`).digest("hex").slice(0, 16)}`;

export function adaptFei98Question(raw: RawQuestion): Fei98Result {
  const id = clean(raw.id); const category = clean(raw.category); const stem = clean(raw.stem); const answer = normalizeOptionKey(raw.answer); const classificationMap = category ? modules[category] : undefined;
  if (!id || !classificationMap || raw.type !== "single" || !stem) return { media: [], rejected: "unsupported or incomplete source record" };
  if (!raw.options || typeof raw.options !== "object" || Array.isArray(raw.options)) return { media: [], rejected: "options is not an object" };
  const options = Object.entries(raw.options as Record<string, unknown>).map(([key, text]) => ({ key: normalizeOptionKey(key), text: clean(text), media: [] as string[] })).filter((option): option is { key: string; text: string; media: string[] } => Boolean(option.key && option.text));
  if (new Set(options.map((option) => option.key)).size !== options.length) return { media: [], rejected: "duplicate normalized option key" };
  if (options.length < 2 || !answer || !options.some((option) => option.key === answer)) return { media: [], rejected: "answer does not reference a usable option" };
  const images = Array.isArray(raw.images) ? raw.images.filter((item): item is string => typeof item === "string" && /^https?:\/\//.test(item)) : [];
  const media = images.map((url, index) => ({ externalId: mediaId(id, index), type: "IMAGE", role: "STEM", path: `media/${mediaId(id, index)}.png`, url }));
  const meta = raw.sourceMeta && typeof raw.sourceMeta === "object" && !Array.isArray(raw.sourceMeta) ? raw.sourceMeta as Record<string, unknown> : {};
  const tags = Array.isArray(raw.pitfallTags) ? raw.pitfallTags.map(clean).filter((tag): tag is string => Boolean(tag)) : [];
  const provenance = source(id);
  return { media, warning: images.length ? "remote image URLs are referenced; package binaries were not downloaded in this JSON-only trial" : undefined, question: {
    externalId: `fei98-${id}`, questionType: "SINGLE_CHOICE", content: { stem, media: media.map((item) => item.externalId), options, correctAnswer: [answer], explanation: clean(raw.explanation) },
    classification: { module: classificationMap.name, subtype: null, knowledgePointExternalIds: [classificationMap.knowledgePointExternalId], sourceTags: tags, sourceDifficulty: typeof raw.difficulty === "number" ? { value: String(raw.difficulty), scale: "fei98-1-5", provider: "fei98" } : null },
    materialExternalId: null, paperContext: { exam: clean(meta.exam), year: Number.isInteger(Number(meta.year)) ? Number(meta.year) : null, province: clean(meta.province), paperType: "行测", paperName: null, originalQuestionNumber: null, section: clean(meta.section) },
    provenance: { content: provenance, answer: provenance, analysis: clean(raw.explanation) ? provenance : null }, answerStatus: "UNVERIFIED", flags: { isActive: raw.reviewed === true }
  } };
}
