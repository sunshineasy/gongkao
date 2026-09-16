import fs from "node:fs/promises";
import path from "node:path";
import initSqlJs, { type Database } from "sql.js";
import { validateQuestionBank } from "./question-bank.js";
import { normalizeQuestionText } from "./question-text.js";

export type StudyMedia = { externalId: string; path: string; url: string | null };
export type StudyMaterial = { externalId: string; title: string | null; content: string | null; media: StudyMedia[] };
export type StudyQuestion = { externalId: string; module: string | null; stem: string; explanation: string | null; correctAnswer: string[]; materialExternalId: string | null; material: StudyMaterial | null; options: { key: string; text: string | null; media: StudyMedia[] }[]; knowledgePoints: { externalId: string; name: string }[]; media: StudyMedia[] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- V1 packages are external JSON validated at import.
type Bank = Record<string, any>;
type SqlValue = string | number | null | Uint8Array;
const rows = (db: Database, sql: string, params: SqlValue[] = []) => { const statement = db.prepare(sql); statement.bind(params); const result: Record<string, unknown>[] = []; while (statement.step()) result.push(statement.getAsObject()); statement.free(); return result; };

async function open(file: string) { const SQL = await initSqlJs({ locateFile: (name) => path.join(process.cwd(), "node_modules", "sql.js", "dist", name) }); let db: Database; try { db = new SQL.Database(await fs.readFile(file)); } catch { db = new SQL.Database(); }
  db.run(`CREATE TABLE IF NOT EXISTS v1_imports (bankId TEXT NOT NULL, bankVersion TEXT NOT NULL, importedAt TEXT NOT NULL, PRIMARY KEY(bankId, bankVersion));
CREATE TABLE IF NOT EXISTS v1_questions (externalId TEXT PRIMARY KEY, bankId TEXT NOT NULL, module TEXT, stem TEXT NOT NULL, explanation TEXT, correctAnswer TEXT NOT NULL, materialExternalId TEXT);
CREATE TABLE IF NOT EXISTS v1_options (questionExternalId TEXT NOT NULL, optionKey TEXT NOT NULL, text TEXT, media TEXT NOT NULL, PRIMARY KEY(questionExternalId, optionKey));
CREATE TABLE IF NOT EXISTS v1_materials (externalId TEXT PRIMARY KEY, title TEXT, content TEXT, media TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS v1_knowledge_points (externalId TEXT PRIMARY KEY, name TEXT NOT NULL, parentExternalId TEXT, level INTEGER NOT NULL, type TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS v1_question_knowledge_points (questionExternalId TEXT NOT NULL, knowledgePointExternalId TEXT NOT NULL, PRIMARY KEY(questionExternalId, knowledgePointExternalId));
CREATE TABLE IF NOT EXISTS v1_media (externalId TEXT PRIMARY KEY, type TEXT NOT NULL, role TEXT NOT NULL, mediaPath TEXT, url TEXT);
CREATE TABLE IF NOT EXISTS v1_question_media (questionExternalId TEXT NOT NULL, mediaExternalId TEXT NOT NULL, PRIMARY KEY(questionExternalId, mediaExternalId));`); return db; }
async function persist(db: Database, file: string) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, db.export()); }

export async function importQuestionBankV1(bank: Bank, file = path.join(process.cwd(), "prisma", "question-bank-v1.db")) {
  const validation = validateQuestionBank(bank); if (validation.errors.length) throw new Error(`V1 validation failed: ${validation.errors.join("; ")}`); const db = await open(file); const bankId = String(bank.bankId); const bankVersion = String(bank.bankVersion);
  if (rows(db, "SELECT 1 FROM v1_imports WHERE bankId = ? AND bankVersion = ?", [bankId, bankVersion]).length) return { imported: false, questions: 0 };
  db.run("BEGIN"); try {
    for (const media of bank.media) db.run("INSERT OR REPLACE INTO v1_media VALUES (?, ?, ?, ?, ?)", [media.externalId, media.type, media.role, media.path, media.url]);
    for (const point of bank.knowledgePoints) db.run("INSERT OR REPLACE INTO v1_knowledge_points VALUES (?, ?, ?, ?, ?)", [point.externalId, point.name, point.parentExternalId, point.level, point.type]);
    for (const material of bank.materials) db.run("INSERT OR REPLACE INTO v1_materials VALUES (?, ?, ?, ?)", [material.externalId, material.title, material.content, JSON.stringify(material.media)]);
    for (const question of bank.questions) { const content = question.content; db.run("INSERT OR REPLACE INTO v1_questions VALUES (?, ?, ?, ?, ?, ?, ?)", [question.externalId, bankId, question.classification.module, content.stem, content.explanation, JSON.stringify(content.correctAnswer), question.materialExternalId]);
      for (const option of content.options) db.run("INSERT OR REPLACE INTO v1_options VALUES (?, ?, ?, ?)", [question.externalId, option.key, option.text, JSON.stringify(option.media)]);
      for (const pointId of question.classification.knowledgePointExternalIds) db.run("INSERT OR REPLACE INTO v1_question_knowledge_points VALUES (?, ?)", [question.externalId, pointId]);
      for (const mediaId of [...content.media, ...content.options.flatMap((option: { media: string[] }) => option.media)]) db.run("INSERT OR REPLACE INTO v1_question_media VALUES (?, ?)", [question.externalId, mediaId]);
    }
    db.run("INSERT INTO v1_imports VALUES (?, ?, ?)", [bankId, bankVersion, new Date().toISOString()]); db.run("COMMIT"); await persist(db, file); return { imported: true, questions: bank.questions.length };
  } catch (error) { db.run("ROLLBACK"); throw error; }
}

const mediaForIds = (db: Database, ids: string[]): StudyMedia[] => ids.flatMap((id) => rows(db, "SELECT externalId, mediaPath, url FROM v1_media WHERE externalId = ?", [id]).map((row) => ({ externalId: String(row.externalId), path: String(row.mediaPath), url: row.url as string | null })));

export async function getStudyQuestion(externalId: string, file?: string): Promise<StudyQuestion | undefined> {
  const db = await open(file ?? path.join(process.cwd(), "prisma", "question-bank-v1.db")); const question = rows(db, "SELECT * FROM v1_questions WHERE externalId = ?", [externalId])[0]; if (!question) return undefined;
  const rawOptions = rows(db, "SELECT optionKey, text, media FROM v1_options WHERE questionExternalId = ? ORDER BY optionKey", [externalId]).map((row) => ({ key: String(row.optionKey), text: row.text as string | null, mediaIds: JSON.parse(String(row.media)) as string[] }));
  const optionMediaIds = new Set(rawOptions.flatMap((option) => option.mediaIds));
  const allQuestionMediaIds = rows(db, "SELECT mediaExternalId FROM v1_question_media WHERE questionExternalId = ?", [externalId]).map((row) => String(row.mediaExternalId));
  const materialRow = question.materialExternalId ? rows(db, "SELECT * FROM v1_materials WHERE externalId = ?", [String(question.materialExternalId)])[0] : undefined;
  const material = materialRow ? { externalId: String(materialRow.externalId), title: normalizeQuestionText(materialRow.title as string | null), content: normalizeQuestionText(materialRow.content as string | null), media: mediaForIds(db, JSON.parse(String(materialRow.media)) as string[]) } : null;
  const knowledgePoints = rows(db, "SELECT k.externalId, k.name FROM v1_knowledge_points k JOIN v1_question_knowledge_points q ON q.knowledgePointExternalId = k.externalId WHERE q.questionExternalId = ?", [externalId]).map((row) => ({ externalId: String(row.externalId), name: String(row.name) }));
  return { externalId: String(question.externalId), module: question.module as string | null, stem: normalizeQuestionText(String(question.stem))!, explanation: normalizeQuestionText(question.explanation as string | null), correctAnswer: JSON.parse(String(question.correctAnswer)), materialExternalId: question.materialExternalId as string | null, material, options: rawOptions.map((option) => ({ key: option.key, text: normalizeQuestionText(option.text), media: mediaForIds(db, option.mediaIds) })), knowledgePoints, media: mediaForIds(db, allQuestionMediaIds.filter((id) => !optionMediaIds.has(id))) };
}
export async function getStudyQuestionsByModule(module: string, file?: string) { const db = await open(file ?? path.join(process.cwd(), "prisma", "question-bank-v1.db")); return rows(db, "SELECT externalId FROM v1_questions WHERE module = ? ORDER BY externalId", [module]).map((row) => String(row.externalId)); }
export async function getRandomStudyQuestions(limit: number, file?: string) { const db = await open(file ?? path.join(process.cwd(), "prisma", "question-bank-v1.db")); return rows(db, "SELECT externalId FROM v1_questions ORDER BY RANDOM() LIMIT ?", [limit]).map((row) => String(row.externalId)); }
export async function getAllStudyQuestionIds(file?: string) { const db = await open(file ?? path.join(process.cwd(), "prisma", "question-bank-v1.db")); return rows(db, "SELECT externalId FROM v1_questions ORDER BY externalId").map((row) => String(row.externalId)); }
export async function getStudyBankSummary(file?: string) { const db = await open(file ?? path.join(process.cwd(), "prisma", "question-bank-v1.db")); return { questions: Number(rows(db, "SELECT COUNT(*) AS count FROM v1_questions")[0].count), options: Number(rows(db, "SELECT COUNT(*) AS count FROM v1_options")[0].count), knowledgePoints: Number(rows(db, "SELECT COUNT(*) AS count FROM v1_knowledge_points")[0].count), materials: Number(rows(db, "SELECT COUNT(*) AS count FROM v1_materials")[0].count), mediaReferences: Number(rows(db, "SELECT COUNT(*) AS count FROM v1_question_media")[0].count), modules: rows(db, "SELECT module, COUNT(*) AS count FROM v1_questions GROUP BY module ORDER BY module").map((row) => ({ module: String(row.module), count: Number(row.count) })) }; }
