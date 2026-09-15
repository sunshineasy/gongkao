import fs from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { validateQuestionBank } from "../src/lib/question-bank.ts";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("用法：npm run question-bank:validate -- <file>");
  const bank = JSON.parse(await fs.readFile(file, "utf8"));
  const schema = JSON.parse(await fs.readFile(path.resolve(process.cwd(), "schemas/question-bank-v1.schema.json"), "utf8"));
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const schemaValid = ajv.validate(schema, bank);
  const report = validateQuestionBank(bank);
  console.log(`Schema validation: ${schemaValid ? "PASS" : "FAIL"}`);
  if (!schemaValid) ajv.errors?.forEach((error) => console.error(`- schema ${error.instancePath || "/"} ${error.message}`));
  console.log(`Materials: ${report.counts.materials}\nKnowledge Points: ${report.counts.knowledgePoints}\nQuestions: ${report.counts.questions}\nMedia: ${report.counts.media}\nCross-object validation: ${report.errors.length ? "FAIL" : "PASS"}`);
  report.errors.forEach((error) => console.error(`- ${error}`));
  if (!schemaValid || report.errors.length) process.exitCode = 1;
}

void main();
