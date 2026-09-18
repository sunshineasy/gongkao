import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import pullModule from "../src/web/pull-state.js";
import { createStudyServer } from "../src/server.ts";

const { createPullState } = pullModule as { createPullState: (threshold?: number) => { pull: (amount: number, options: { atBottom: boolean; busy: boolean }) => { distance: number; armed: boolean; triggering: boolean }; release: (options: { busy: boolean }) => { trigger: boolean; distance: number; armed: boolean; triggering: boolean }; reset: () => { distance: number; armed: boolean; triggering: boolean } } };

async function main() {
  const root = path.join(process.cwd(), "src", "web");
  const [html, css, js] = await Promise.all(["index.html", "app.css", "app.js"].map(file => fs.readFile(path.join(root, file), "utf8")));
  assert.match(html, /viewport/); assert.match(html, /aria-live/);
  for (const token of ["--ink", "--blue", "@media (max-width: 700px)", "prefers-reduced-motion"]) assert.ok(css.includes(token), `${token} is required for the responsive design system`);
  for (const state of [".study-stage", ".question-flow", ".material-context", ".question-prompt", ".answer-list", ".answer:hover", ".answer:focus-visible", ".answer:disabled", ".answer.correct", ".answer.wrong", ".answer-status", ".answer-reveal", ".answer-summary", ".explanation-copy", ".next-pull.armed"]) assert.ok(css.includes(state), `${state} is required for the reading-flow learning interface`);
  for (const composition of [".status-page", ".recent-flow", ".companion-stage", ".lulu-figure", ".facts-flow", ".status-actions"]) assert.ok(css.includes(composition), `${composition} is required for the learning-status composition`);
  assert.ok(html.includes("pull-state.js"), "learning page loads the pull state controller"); assert.ok(js.includes("touchend"), "touch release advances only after the threshold"); assert.ok(js.includes('id="continue"'), "accessible continue fallback remains available");
  for (const pullFeature of ["pullThreshold=150", "showPull", "confirmPull", "resetPull", "if(busy)return"]) assert.ok(js.includes(pullFeature), `${pullFeature} keeps next-question navigation deliberate and reversible`);
  const pull = createPullState(150);
  assert.deepEqual(pull.pull(200, { atBottom: false, busy: false }), { distance: 0, armed: false, triggering: false }, "off-bottom scrolling never accumulates pull");
  pull.pull(149, { atBottom: true, busy: false }); assert.equal(pull.release({ busy: false }).trigger, false, "below threshold never advances");
  pull.pull(150, { atBottom: true, busy: false }); assert.equal(pull.release({ busy: false }).trigger, true, "threshold arms exactly one advance"); assert.equal(pull.release({ busy: false }).trigger, false, "an armed pull cannot trigger twice");
  pull.reset(); pull.pull(150, { atBottom: true, busy: false }); assert.deepEqual(pull.reset(), { distance: 0, armed: false, triggering: false }, "reverse, release cancellation, and timer reset clear the pull");
  assert.deepEqual(pull.pull(150, { atBottom: true, busy: true }), { distance: 0, armed: false, triggering: false }, "busy navigation ignores extra input");
  const server = createStudyServer({ userDataFile: path.join(process.cwd(), "tmp-unused-user.db"), questionBankFile: path.join(process.cwd(), "tmp-unused-bank.db") }); server.listen(0); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try { const response = await fetch(`http://127.0.0.1:${address.port}/pull-state.js`); assert.equal(response.status, 200); assert.match(response.headers.get("content-type") ?? "", /^application\/javascript; charset=utf-8$/); assert.match(await response.text(), /createPullState/); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  const statusStart = js.indexOf("async function renderStatus"), statusEnd = js.indexOf("async function renderManage", statusStart); assert.ok(statusStart >= 0 && statusEnd > statusStart, "learning status has its own rendering boundary");
  const statusView = js.slice(statusStart, statusEnd);
  for (const fact of ["正确率", "作答数", "平均作答用时", "7D", "ALL", "trend(s.trend)", "continue-learning", "wrongCountCurrent", "companion-stage", "管理"]) assert.ok(statusView.includes(fact), `${fact} remains part of the learning-status experience`);
  assert.ok(statusView.includes("s.range"), "range switching uses the API-selected range"); assert.equal(statusView.includes("streak"), false, "learning status does not add gamified streak data");
  for (const view of ["renderReviewEmpty", "review-ending", "renderCompleted", "ending-actions", "renderSpecialModules", "special-list", "renderSpecialChoice", "replaceCurrent:replacing"]) assert.ok(js.includes(view), `${view} keeps existing review, completion, and special-training states intentional`);
  assert.ok(js.includes("现在没有需要回顾的错题"), "empty wrong-review state returns naturally to learning"); assert.ok(js.includes("id=\"again\"") && js.includes("id=\"end\""), "completion keeps exactly its two natural exits"); assert.ok(js.includes("开始专项训练"), "special confirmation keeps one clear start action");
  for (const screen of ["renderStatus", "renderManage", "renderHistory", "renderBank", "renderQuestion"]) assert.ok(js.includes(`function ${screen}`) || js.includes(`async function ${screen}`), `${screen} navigation state exists`);
  assert.ok(js.includes('class="companion-stage"'), "learning status reserves a real visual stage for 噜噜"); assert.equal(js.includes('class="metrics"'), false, "learning status does not use a KPI-card grid");
  for (const composition of ['class="study-chrome"', 'class="study-stage"', 'class="question-flow"', 'class="material-context"', 'class="answer-list"']) assert.ok(js.includes(composition), `${composition} keeps learning content in a deliberate reading hierarchy`);
  assert.ok(js.includes("正在准备学习内容"), "loading state is rendered"); assert.equal(js.includes("error.message ||"), false, "raw technical errors are not rendered");
  for (const feedback of ["aria-disabled", "classList.add(\"selected\"", "correctAnswer.includes(key)", "answer-status", "answer-summary", "explanation-copy", "app.querySelector(\".question-flow\")"]) assert.ok(js.includes(feedback), `${feedback} keeps submitted answers and feedback in the reading flow`);
  assert.equal(js.includes("plannedQuestionCount"), false, "learning UI does not expose session progress");
  console.log("M2.6 tests: PASS");
}
void main();

