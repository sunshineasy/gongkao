import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const webRoot = path.join(process.cwd(), "src", "web");
  const [html, css, source] = await Promise.all(["index.html", "app.css", "app.js"].map(file => fs.readFile(path.join(webRoot, file), "utf8")));
  assert.match(html, /<main id="app"/);
  assert.match(css, /\.question-prompt h1/);
  assert.match(css, /\.material-context/);
  for (const feature of ["renderCreateUser", "renderIdle", "renderQuestion", "renderCompleted", "renderSpecialModules", "renderAccount"]) assert.ok(source.includes(`function ${feature}`), `${feature} must have a UI state`);
  assert.ok(source.includes("showPull"), "forward has deliberate overscroll feedback");
  assert.ok(source.includes("touchend"), "touch input is supported");
  assert.ok(source.includes("visibilitychange"), "hidden time is not counted");
  assert.ok(source.includes("correctAnswer.includes"), "all correct options receive feedback");
  assert.ok(source.includes("r.explanation?"), "explanation is conditional");
  assert.equal(source.includes("confirm("), false, "special training uses a formal choice view rather than a prompt");
  assert.equal(source.includes("plannedQuestionCount"), false, "ongoing learning view does not expose session progress");
  console.log("M2.2-C2 tests: PASS");
}
void main();

