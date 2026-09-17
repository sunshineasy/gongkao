import { getAllStudyQuestionIds, getStudyQuestion, type StudyQuestion } from "./study-question-bank.js";
import { createSession, getCurrentSession, getEffectiveLastAttempts, getSessionQuestions, type Session, type SessionType } from "./user-data.js";

export type PlannerRandom = () => number;
export type PlanInput = { userId: string; type: SessionType; userDataFile: string; questionBankFile: string; module?: string; previousSessionId?: string; random?: PlannerRandom };
type Unit = { module: string; questions: StudyQuestion[]; newCount: number; oldest: number; id: string };
const shuffle = <T>(items: T[], random: PlannerRandom) => [...items].sort(() => random() - 0.5);
const stamp = (iso: string | undefined) => iso ? Date.parse(iso) : -Infinity;

export function buildSelectionUnits(questions: StudyQuestion[], history: Map<string, string>): Unit[] {
  const grouped = new Map<string, StudyQuestion[]>();
  for (const question of questions) {
    if (!question.module || !question.options.length) continue;
    const key = question.materialExternalId ? `material:${question.materialExternalId}` : `question:${question.externalId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), question]);
  }
  return [...grouped.entries()].map(([id, group]) => ({ id, module: group[0].module!, questions: group, newCount: group.filter(q => !history.has(q.externalId)).length, oldest: Math.min(...group.map(q => stamp(history.get(q.externalId)))) }));
}
function chooseUnits(units: Unit[], target: number, random: PlannerRandom, excluded: Set<string>) {
  const ranked = shuffle(units, random).sort((a,b) => b.newCount - a.newCount || a.oldest - b.oldest || Number(excluded.has(a.id)) - Number(excluded.has(b.id)));
  const chosen: Unit[] = [];
  for (const unit of ranked) {
    const count = chosen.reduce((sum, item) => sum + item.questions.length, 0);
    if (!chosen.length || Math.abs(count + unit.questions.length - target) <= Math.abs(count - target) || count < target) chosen.push(unit);
  }
  return chosen.flatMap(unit => unit.questions.map(question => question.externalId));
}
export async function generateSessionPlan(input: PlanInput): Promise<{ type: SessionType; questionExternalIds: string[] }> {
  const random = input.random ?? Math.random;
  const ids = await getAllStudyQuestionIds(input.questionBankFile);
  const questions = (await Promise.all(ids.map(id => getStudyQuestion(id, input.questionBankFile)))).filter((q): q is StudyQuestion => !!q);
  const history = await getEffectiveLastAttempts(input.userId, input.userDataFile);
  const units = buildSelectionUnits(questions, history);
  const excludedQuestions = new Set(input.previousSessionId ? (await getSessionQuestions(input.previousSessionId, input.userDataFile)).map(question => question.questionExternalId) : []);
  const excluded = new Set(units.filter(unit => unit.questions.some(question => excludedQuestions.has(question.externalId))).map(unit => unit.id));
  const byModule = new Map<string, Unit[]>(); for (const unit of units) byModule.set(unit.module, [...(byModule.get(unit.module) ?? []), unit]);
  const modules = [...byModule.keys()];
  if (input.type === "special") { if (!input.module || !byModule.has(input.module)) throw new Error("指定模块没有可训练题目"); return { type: "special", questionExternalIds: chooseUnits(byModule.get(input.module)!, 30, random, excluded) }; }
  if (!modules.length) throw new Error("没有可训练题目");
  const count = modules.length === 1 ? 1 : modules.length === 2 ? 2 : Math.min(modules.length, random() < .5 ? 2 : 3);
  const previousModules = new Set(units.filter(unit => unit.questions.some(question => excludedQuestions.has(question.externalId))).map(unit => unit.module));
  const selected = shuffle(modules, random).sort((a,b) => Number(previousModules.has(a)) - Number(previousModules.has(b))).slice(0, count);
  return { type: "normal", questionExternalIds: selected.flatMap(module => chooseUnits(byModule.get(module)!, 10, random, excluded)) };
}
export async function createPlannedSession(input: PlanInput): Promise<{ session: Session; created: boolean }> {
  const ongoing = await getCurrentSession(input.userId, input.userDataFile);
  if (ongoing) return { session: ongoing, created: false };
  const plan = await generateSessionPlan(input);
  return { session: await createSession({ userId: input.userId, type: plan.type, questionExternalIds: plan.questionExternalIds }, input.userDataFile), created: true };
}
