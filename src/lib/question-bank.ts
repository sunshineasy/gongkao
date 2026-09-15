export type ValidationReport = { errors: string[]; warnings: string[]; counts: { materials: number; knowledgePoints: number; questions: number; media: number } };
type OptionLike = { key?: string; text?: unknown; media?: unknown };

const safeMediaPath = (value: unknown) => typeof value === "string" && value.length > 0 && !/^[A-Za-z]:/.test(value) && !value.startsWith("/") && !value.split(/[\\/]/).includes("..");
const addUnique = (ids: Set<string>, value: unknown, label: string, errors: string[]) => { if (typeof value !== "string" || !value) errors.push(`${label}.externalId 无效`); else if (ids.has(value)) errors.push(`${label}.externalId 重复: ${value}`); else ids.add(value); };

export function validateQuestionBank(bank: unknown): ValidationReport {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- validator intentionally accepts untyped JSON.
  const errors: string[] = []; const data = bank as Record<string, any> | null;
  const materials = Array.isArray(data?.materials) ? data.materials : [];
  const points = Array.isArray(data?.knowledgePoints) ? data.knowledgePoints : [];
  const questions = Array.isArray(data?.questions) ? data.questions : [];
  const media = Array.isArray(data?.media) ? data.media : [];
  const allIds = new Set<string>(); const materialIds = new Set<string>(); const pointIds = new Set<string>(); const mediaIds = new Set<string>();
  materials.forEach((item, index) => { addUnique(allIds, item?.externalId, `materials[${index}]`, errors); if (typeof item?.externalId === "string") materialIds.add(item.externalId); });
  points.forEach((item, index) => { addUnique(allIds, item?.externalId, `knowledgePoints[${index}]`, errors); if (typeof item?.externalId === "string") pointIds.add(item.externalId); });
  questions.forEach((item, index) => addUnique(allIds, item?.externalId, `questions[${index}]`, errors));
  media.forEach((item, index) => { addUnique(allIds, item?.externalId, `media[${index}]`, errors); if (typeof item?.externalId === "string") mediaIds.add(item.externalId); if (!safeMediaPath(item?.path)) errors.push(`media[${index}].path 必须是安全的包内相对路径`); });
  const checkMediaRefs = (refs: unknown, label: string, role: string) => { if (!Array.isArray(refs)) return; refs.forEach((id) => { const item = media.find((entry) => entry?.externalId === id); if (!item) errors.push(`${label}.media 引用不存在: ${id}`); else if (item.role !== role) errors.push(`${label}.media 角色必须为 ${role}: ${id}`); }); };
  const visitParent = (id: string, trail: Set<string>) => { const point = points.find((item) => item?.externalId === id); const parent = point?.parentExternalId; if (!parent) return; if (!pointIds.has(parent)) { errors.push(`KnowledgePoint ${id}.parentExternalId 不存在: ${parent}`); return; } if (trail.has(parent)) { errors.push(`KnowledgePoint 存在循环: ${id}`); return; } const next = new Set(trail); next.add(parent); visitParent(parent, next); };
  points.forEach((point) => { if (typeof point?.externalId === "string") visitParent(point.externalId, new Set([point.externalId])); });
  materials.forEach((material, index) => checkMediaRefs(material?.media, `materials[${index}]`, "MATERIAL"));
  questions.forEach((question, index) => {
    const prefix = `questions[${index}]`; const content = question?.content; const options = Array.isArray(content?.options) ? content.options : [];
    if (question?.questionType === "SINGLE_CHOICE" && (!Array.isArray(content?.correctAnswer) || content.correctAnswer.length !== 1)) errors.push(`${prefix}.SINGLE_CHOICE 必须且只能有一个 correctAnswer`);
    const optionKeys = new Set<string>(); options.forEach((option: OptionLike, optionIndex: number) => { if (optionKeys.has(option?.key ?? "")) errors.push(`${prefix}.options[${optionIndex}].key 重复: ${option?.key}`); optionKeys.add(option?.key ?? ""); if (!(typeof option?.text === "string" && option.text.trim()) && (!Array.isArray(option?.media) || option.media.length === 0)) errors.push(`${prefix}.options[${optionIndex}] 必须有 text 或 media`); checkMediaRefs(option?.media, `${prefix}.options[${optionIndex}]`, "OPTION"); });
    (content?.correctAnswer ?? []).forEach((key: unknown) => { if (!optionKeys.has(key as string)) errors.push(`${prefix}.correctAnswer 不存在于 options: ${key}`); });
    checkMediaRefs(content?.media, `${prefix}.content`, "STEM");
    if (question?.materialExternalId && !materialIds.has(question.materialExternalId)) errors.push(`${prefix}.materialExternalId 不存在: ${question.materialExternalId}`);
    (question?.classification?.knowledgePointExternalIds ?? []).forEach((id: unknown) => { if (!pointIds.has(id as string)) errors.push(`${prefix}.knowledgePointExternalId 不存在: ${id}`); });
    const provenance = question?.provenance; if (!provenance?.content) errors.push(`${prefix}.provenance.content 缺失`);
    if (question?.answerStatus === "VERIFIED" && !provenance?.answer) errors.push(`${prefix}.VERIFIED 题目必须有 answer provenance`);
  });
  return { errors, warnings: [], counts: { materials: materials.length, knowledgePoints: points.length, questions: questions.length, media: media.length } };
}
