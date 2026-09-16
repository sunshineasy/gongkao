import { getStudyQuestion, type StudyQuestion } from "./study-question-bank.js";
import { advanceSession, endSessionEarly, getAttempts, getCurrentSession, getSession, getSessionQuestions, submitAttempt, type Session } from "./user-data.js";
import { createPlannedSession, type PlannerRandom } from "./session-planner.js";

export type RunnerInput = { userId: string; userDataFile: string; questionBankFile: string };
export type SessionProgress = { session: Session; question: StudyQuestion | null; autoAdvancedMissing: number };
export async function resumeSession(input: RunnerInput): Promise<SessionProgress | undefined> {
  const session = await getCurrentSession(input.userId, input.userDataFile);
  if (!session) return undefined;
  let skipped = 0;
  for (const item of await getSessionQuestions(session.id, input.userDataFile)) {
    if (item.traversedAt) continue;
    const question = await getStudyQuestion(item.questionExternalId, input.questionBankFile);
    if (question) return { session: await getSession(session.id, input.userDataFile), question, autoAdvancedMissing: skipped };
    await advanceSession(session.id, item.questionExternalId, input.userDataFile); skipped++;
  }
  return { session: await getSession(session.id, input.userDataFile), question: null, autoAdvancedMissing: skipped };
}
export async function submitCurrentAnswer(input: RunnerInput & { selectedAnswer: string; cumulativeAnswerDuration: number; submissionId: string }) {
  const progress = await resumeSession(input); if (!progress?.question || progress.session.userId !== input.userId) throw new Error("没有可作答的当前题目");
  if (!progress.question.options.some(option => option.key === input.selectedAnswer)) throw new Error("答案选项无效");
  const isCorrect = progress.question.correctAnswer.includes(input.selectedAnswer);
  const attempt = await submitAttempt({ userId: input.userId, questionExternalId: progress.question.externalId, submittedAnswer: input.selectedAnswer, isCorrect, cumulativeAnswerDuration: input.cumulativeAnswerDuration, sessionId: progress.session.id, learningContext: progress.session.type, submissionId: input.submissionId }, input.userDataFile);
  return { attempt, isCorrect, correctAnswer: progress.question.correctAnswer };
}
export async function forwardCurrent(input: RunnerInput) {
  const progress = await resumeSession(input); if (!progress?.question || progress.session.userId !== input.userId) throw new Error("没有可前进的当前题目");
  await advanceSession(progress.session.id, progress.question.externalId, input.userDataFile);
  return resumeSession(input);
}
export async function getCompletionStats(sessionId: string, userDataFile: string) {
  const session = await getSession(sessionId, userDataFile);
  const attempts = (await getAttempts(userDataFile, session.userId)).filter(attempt => attempt.sessionId === sessionId);
  const correctCount = attempts.filter(attempt => attempt.isCorrect).length, answeredCount = attempts.length;
  return { plannedCount: session.plannedQuestionCount, traversedCount: session.traversedQuestionCount, answeredCount, correctCount, wrongCount: answeredCount - correctCount, accuracy: answeredCount ? correctCount / answeredCount : null, answerDuration: attempts.reduce((total, attempt) => total + attempt.cumulativeAnswerDuration, 0) };
}
export async function refreshSession(input: RunnerInput & { random?: PlannerRandom }) {
  const current = await getCurrentSession(input.userId, input.userDataFile); if (!current) throw new Error("没有进行中的训练");
  const first = (await getSessionQuestions(current.id, input.userDataFile))[0];
  const module = first ? (await getStudyQuestion(first.questionExternalId, input.questionBankFile))?.module ?? undefined : undefined;
  await endSessionEarly(current.id, input.userDataFile);
  return createPlannedSession({ userId: input.userId, type: current.type, module: current.type === "special" ? module : undefined, previousSessionId: current.id, userDataFile: input.userDataFile, questionBankFile: input.questionBankFile, random: input.random });
}
