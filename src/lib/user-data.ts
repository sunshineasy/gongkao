import fs from "node:fs/promises";
import path from "node:path";
import initSqlJs, { type Database } from "sql.js";

export type Attempt = { id: number; questionExternalId: string; selectedAnswer: string; isCorrect: boolean; answeredAt: string };

async function open(file: string): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: (name) => path.join(process.cwd(), "node_modules", "sql.js", "dist", name) });
  let db: Database;
  try { db = new SQL.Database(await fs.readFile(file)); } catch { db = new SQL.Database(); }
  db.run("CREATE TABLE IF NOT EXISTS attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, questionExternalId TEXT NOT NULL, selectedAnswer TEXT NOT NULL, isCorrect INTEGER NOT NULL, answeredAt TEXT NOT NULL)");
  return db;
}

async function save(db: Database, file: string) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, db.export()); }

export async function initializeUserData(file: string) { const db = await open(file); await save(db, file); }

export async function saveAttempt(input: Omit<Attempt, "id" | "answeredAt">, file: string): Promise<Attempt> {
  const db = await open(file); const answeredAt = new Date().toISOString();
  db.run("INSERT INTO attempts (questionExternalId, selectedAnswer, isCorrect, answeredAt) VALUES (?, ?, ?, ?)", [input.questionExternalId, input.selectedAnswer, input.isCorrect ? 1 : 0, answeredAt]);
  const row = db.exec("SELECT id, questionExternalId, selectedAnswer, isCorrect, answeredAt FROM attempts ORDER BY id DESC LIMIT 1")[0]?.values[0];
  await save(db, file);
  if (!row) throw new Error("Attempt insert failed");
  return { id: Number(row[0]), questionExternalId: String(row[1]), selectedAnswer: String(row[2]), isCorrect: Boolean(row[3]), answeredAt: String(row[4]) };
}

export async function getAttempts(file: string): Promise<Attempt[]> {
  const db = await open(file); const result = db.exec("SELECT id, questionExternalId, selectedAnswer, isCorrect, answeredAt FROM attempts ORDER BY id")[0];
  return (result?.values ?? []).map((row) => ({ id: Number(row[0]), questionExternalId: String(row[1]), selectedAnswer: String(row[2]), isCorrect: Boolean(row[3]), answeredAt: String(row[4]) }));
}
