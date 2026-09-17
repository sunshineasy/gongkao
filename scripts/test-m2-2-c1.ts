import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const source = await fs.readFile(path.join(process.cwd(), "src", "server.ts"), "utf8");
  for (const endpoint of ["/api/study/start", "/api/study/current", "/api/study/submit", "/api/study/forward"]) assert.ok(source.includes(endpoint));
  assert.ok(!source.includes("correctAnswer:q.correctAnswer"));
  assert.ok(source.includes("explanation:r.explanation"));
  console.log("M2.2-C1 tests: PASS");
}
void main();
