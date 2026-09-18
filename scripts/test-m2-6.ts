import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const root = path.join(process.cwd(), "src", "web");
  const [html, css, js] = await Promise.all(["index.html", "app.css", "app.js"].map(file => fs.readFile(path.join(root, file), "utf8")));
  assert.match(html, /viewport/); assert.match(html, /aria-live/);
  for (const token of ["--ink", "--blue", "@media (max-width: 700px)", "prefers-reduced-motion"]) assert.ok(css.includes(token), `${token} is required for the responsive design system`);
  for (const state of [".study-stage", ".question-flow", ".material-context", ".question-prompt", ".answer-list", ".answer:hover", ".answer:focus-visible", ".answer:disabled", ".answer.correct", ".answer.wrong", ".answer-status", ".answer-reveal", ".answer-summary", ".explanation-copy", ".next-pull.armed"]) assert.ok(css.includes(state), `${state} is required for the reading-flow learning interface`);
  for (const composition of [".status-page", ".companion", ".lulu-figure", ".facts-flow", ".actions-flow"]) assert.ok(css.includes(composition), `${composition} is required for the learning-status composition`);
  assert.ok(js.includes("touchY-e.changedTouches[0].clientY>95"), "overscroll requires a deliberate touch threshold"); assert.ok(js.includes("touchend"), "touch release advances only after the threshold"); assert.ok(js.includes('id="continue"'), "accessible continue fallback remains available");
  for (const screen of ["renderStatus", "renderManage", "renderHistory", "renderBank", "renderQuestion"]) assert.ok(js.includes(`function ${screen}`) || js.includes(`async function ${screen}`), `${screen} navigation state exists`);
  assert.ok(js.includes('class="companion"'), "learning status reserves a real visual stage for 噜噜"); assert.equal(js.includes('class="metrics"'), false, "learning status does not use a KPI-card grid");
  for (const composition of ['class="study-chrome"', 'class="study-stage"', 'class="question-flow"', 'class="material-context"', 'class="answer-list"']) assert.ok(js.includes(composition), `${composition} keeps learning content in a deliberate reading hierarchy`);
  assert.ok(js.includes("正在准备学习内容"), "loading state is rendered"); assert.equal(js.includes("error.message ||"), false, "raw technical errors are not rendered");
  for (const feedback of ["aria-disabled", "classList.add(\"selected\"", "correctAnswer.includes(key)", "answer-status", "answer-summary", "explanation-copy", "app.querySelector(\".question-flow\")"]) assert.ok(js.includes(feedback), `${feedback} keeps submitted answers and feedback in the reading flow`);
  assert.equal(js.includes("plannedQuestionCount"), false, "learning UI does not expose session progress");
  console.log("M2.6 tests: PASS");
}
void main();
