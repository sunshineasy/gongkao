import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const root = path.join(process.cwd(), "src", "web");
  const [html, css, js] = await Promise.all(["index.html", "app.css", "app.js"].map(file => fs.readFile(path.join(root, file), "utf8")));
  assert.match(html, /viewport/); assert.match(html, /aria-live/);
  for (const token of ["--ink", "--blue", "--radius", "@media (max-width:540px)", "prefers-reduced-motion"]) assert.ok(css.includes(token), `${token} is required for the responsive design system`);
  for (const state of [".option:hover", ".option.correct", ".option.wrong", ".feedback", ".explanation", ".continue.ready"]) assert.ok(css.includes(state), `${state} is required for learning feedback`);
  for (const composition of [".status-page", ".lulu-stage", ".lulu-figure", ".learning-facts", ".learning-actions"]) assert.ok(css.includes(composition), `${composition} is required for the learning-status composition`);
  assert.ok(js.includes("pullDistance >= 100"), "overscroll requires a deliberate threshold"); assert.ok(js.includes("touchend"), "touch release advances only after the threshold"); assert.ok(js.includes('id="continue"'), "accessible continue fallback remains available");
  for (const screen of ["renderStatus", "renderManage", "renderHistory", "renderBank", "renderQuestion"]) assert.ok(js.includes(`function ${screen}`) || js.includes(`async function ${screen}`), `${screen} navigation state exists`);
  assert.ok(js.includes('class="lulu-stage"'), "learning status reserves a real visual stage for 噜噜"); assert.equal(js.includes('class="metrics"'), false, "learning status does not use a KPI-card grid");
  assert.ok(js.includes("loadingView"), "loading state is rendered"); assert.equal(js.includes("error.message ||"), false, "raw technical errors are not rendered");
  assert.equal(js.includes("plannedQuestionCount"), false, "learning UI does not expose session progress");
  console.log("M2.6 tests: PASS");
}
void main();
