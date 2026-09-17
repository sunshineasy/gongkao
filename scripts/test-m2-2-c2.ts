import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const source = await fs.readFile(path.join(process.cwd(), "src", "web", "app.js"), "utf8");
  assert.ok(source.includes("继续向下滚动"));
  assert.ok(source.includes("换一组"));
  assert.ok(!source.includes("progress bar"));
  assert.ok(source.includes("r.explanation?"));
  assert.ok(source.includes("解析："));
  console.log("M2.2-C2 tests: PASS");
}
void main();
