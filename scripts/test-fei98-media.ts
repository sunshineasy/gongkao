import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const root = path.resolve(process.cwd(), "fixtures/import-trials/fei98");
  const bank = JSON.parse(await fs.readFile(path.join(root, "question-bank-v1.json"), "utf8")) as { media: { path: string; url: string }[] };
  const report = JSON.parse(await fs.readFile(path.join(root, "import-report.json"), "utf8")) as { media: { mediaReferenced: number; mediaDownloaded: number; mediaFailed: number } };
  assert.equal(bank.media.length, report.media.mediaReferenced);
  assert.equal(report.media.mediaDownloaded + report.media.mediaFailed, report.media.mediaReferenced);
  for (const item of bank.media) { assert.match(item.path, /^media\/fei98-media-[a-f0-9]+\.png$/); assert.match(item.url, /^https:\/\//); const file = await fs.stat(path.join(root, item.path)); assert.ok(file.size > 0); }
  console.log("Fei98 media tests: PASS");
}
void main();
