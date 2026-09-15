import fs from "node:fs/promises";
import path from "node:path";
import { importQuestionBankV1 } from "./study-question-bank.js";
import { initializeUserData } from "./user-data.js";

export const appDataDirectory = path.join(process.cwd(), "data");
export const questionBankFile = path.join(appDataDirectory, "question-bank.db");
export const userDataFile = path.join(appDataDirectory, "user-data.db");
const seedFile = path.join(process.cwd(), "fixtures", "import-trials", "fei98", "question-bank-v1.json");

export async function initializeApplicationData() {
  await fs.mkdir(appDataDirectory, { recursive: true });
  try { await fs.access(questionBankFile); } catch { await importQuestionBankV1(JSON.parse(await fs.readFile(seedFile, "utf8")), questionBankFile); }
  await initializeUserData(userDataFile);
  return { questionBankFile, userDataFile };
}
