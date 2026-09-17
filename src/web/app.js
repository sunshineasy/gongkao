const app = document.querySelector("#app");
let state, answered = false, startedAt = 0, elapsed = 0, forwardArmed = false, busy = false, touchStartY = 0, reviewMode = false;

const esc = value => String(value ?? "").replace(/[&<>]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]);
const shell = content => `<div class="shell">${content}</div>`;
const topbar = user => `<header class="topbar"><span class="brand">gongkao</span>${user ? `<button class="quiet" id="account">${esc(user.nickname)}</button>` : ""}</header>`;
const errorView = error => `<p class="error">${esc(error.message || "操作失败")}</p>`;

async function api(url, method = "GET", data) {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: data ? JSON.stringify(data) : undefined });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "操作失败");
  return result;
}

function pauseTimer() { if (startedAt) { elapsed += performance.now() - startedAt; startedAt = 0; } }
function resumeTimer() { if (!answered && !startedAt && !document.hidden) startedAt = performance.now(); }
function atBottom() { return innerHeight + scrollY >= document.documentElement.scrollHeight - 4; }

async function forward() {
  if (busy) return;
  busy = true;
  pauseTimer();
  try { if (reviewMode) return renderReview(await api("/api/study/wrong-review/forward", "POST", {})); await api("/api/study/forward", "POST", {}); await load(); } catch (error) { app.insertAdjacentHTML("beforeend", errorView(error)); } finally { busy = false; }
}

function downwardIntent() {
  if (!atBottom()) { forwardArmed = false; return; }
  if (forwardArmed) { forwardArmed = false; void forward(); return; }
  forwardArmed = true;
}

addEventListener("wheel", event => { if (event.deltaY > 0) downwardIntent(); else forwardArmed = false; }, { passive: true });
addEventListener("touchstart", event => { touchStartY = event.touches[0].clientY; }, { passive: true });
addEventListener("touchend", event => { if (touchStartY - event.changedTouches[0].clientY > 45) downwardIntent(); }, { passive: true });
addEventListener("visibilitychange", () => document.hidden ? pauseTimer() : resumeTimer());

function bindAccount(user) {
  const account = app.querySelector("#account");
  if (account) account.onclick = () => void renderAccount(user);
}

async function renderAccount(user) {
  const { users } = await api("/api/study/users");
  app.innerHTML = shell(`${topbar(user)}<section class="card account-menu"><h2>切换学习档案</h2>${users.map(item => `<button class="secondary" data-user="${esc(item.id)}">${esc(item.nickname)}${item.id === user.id ? "（当前）" : ""}</button>`).join("")}<div><button class="text-button" id="new-user">新建档案</button><button class="text-button" id="back">返回学习</button></div></section>`);
  app.querySelectorAll("[data-user]").forEach(button => button.onclick = async () => { await api("/api/study/user/active", "POST", { userId: button.dataset.user }); await load(); });
  app.querySelector("#new-user").onclick = () => renderCreateUser();
  app.querySelector("#back").onclick = () => void load();
}

function renderCreateUser() {
  app.innerHTML = shell(`${topbar()}<section class="card"><div class="intro"><h1>从一题开始</h1><p>创建一个学习档案，之后会自动回到上次学习的位置。</p></div><label class="field">学习档案名称<input id="nickname" maxlength="30" placeholder="例如：小王" autofocus></label><button class="primary" id="create">开始学习</button></section>`);
  app.querySelector("#create").onclick = async () => {
    const button = app.querySelector("#create");
    button.disabled = true;
    try { await api("/api/study/user", "POST", { nickname: app.querySelector("#nickname").value }); await load(); } catch (error) { button.disabled = false; app.insertAdjacentHTML("beforeend", errorView(error)); }
  };
}

async function renderIdle(user) {
  const modules = await api("/api/study/modules");
  app.innerHTML = shell(`${topbar(user)}<section class="intro"><h1>开始学习</h1><p>准备好后直接开始，本次会从题目本身开始。</p><button class="primary" id="start">开始学习</button><div class="secondary-actions"><button class="text-button" id="wrong-review">错题回顾</button><button class="text-button" id="status">学习状态</button><button class="text-button" id="history">训练历史</button></div></section><section class="card"><span class="eyebrow">专项训练</span><p class="muted">选择一个模块，开始一组专门练习。</p><div class="module-picker">${modules.map(module => `<button data-module="${esc(module)}">${esc(module)}</button>`).join("")}</div></section>`);
  bindAccount(user);
  app.querySelector("#wrong-review").onclick = () => void startReview(user);
  app.querySelector("#status").onclick = () => void renderStatus(user, "7d");
  app.querySelector("#history").onclick = () => void renderHistory(user);
  app.querySelector("#start").onclick = async () => { await api("/api/study/start", "POST", {}); await load(); };
  app.querySelectorAll("[data-module]").forEach(button => button.onclick = () => void renderSpecialChoice(button.dataset.module, false));
}

function renderSpecialChoice(module, replacing) {
  app.innerHTML = shell(`${topbar(state.user)}<section class="card mode-panel"><span class="eyebrow">专项训练</span><h2>${esc(module)}</h2><p class="muted">${replacing ? "开始后将结束当前这一组训练，改为该模块的专项训练。" : "将从这个模块开始一组专项训练。"}</p><div><button class="primary" id="confirm-special">开始专项训练</button><button class="text-button" id="cancel-special">返回</button></div></section>`);
  bindAccount(state.user);
  app.querySelector("#confirm-special").onclick = async () => { await api("/api/study/special", "POST", { module, replaceCurrent: replacing }); await load(); };
  app.querySelector("#cancel-special").onclick = () => void load();
}

async function renderSpecialModules(replacing) {
  const modules = await api("/api/study/modules");
  app.innerHTML = shell(`${topbar(state.user)}<section class="card mode-panel"><span class="eyebrow">专项训练</span><h2>选择练习模块</h2><div class="module-picker">${modules.map(module => `<button data-module="${esc(module)}">${esc(module)}</button>`).join("")}</div><button class="text-button" id="cancel-modules">返回</button></section>`);
  bindAccount(state.user);
  app.querySelectorAll("[data-module]").forEach(button => button.onclick = () => void renderSpecialChoice(button.dataset.module, replacing));
  app.querySelector("#cancel-modules").onclick = () => void load();
}

function renderCompleted(current) {
  const stats = current.completion;
  app.innerHTML = shell(`${topbar(current.user)}<section class="card completion"><span class="eyebrow">本次训练</span><h1>已完成</h1><div class="facts"><div class="fact"><span>已作答</span><b>${stats.answeredCount}/${stats.plannedCount}</b></div><div class="fact"><span>正确</span><b>${stats.correctCount}</b></div><div class="fact"><span>错误</span><b>${stats.wrongCount}</b></div><div class="fact"><span>正确率</span><b>${stats.accuracy == null ? "—" : `${Math.round(stats.accuracy * 100)}%`}</b></div></div><p class="muted">作答用时 ${stats.answerDuration} 秒</p><div><button class="primary" id="again">继续学习</button><button class="text-button" id="end">结束</button></div></section>`);
  bindAccount(current.user);
  app.querySelector("#again").onclick = async () => { await api("/api/study/start", "POST", {}); await load(); };
  app.querySelector("#end").onclick = () => void renderIdle(current.user);
}

function renderQuestion(current) {
  reviewMode = false;
  const question = current.question;
  answered = false; elapsed = 0; forwardArmed = false;
  app.innerHTML = shell(`${topbar(current.user)}<div><button class="quiet" id="refresh">换一组</button><button class="quiet" id="special">专项训练</button></div><article><div class="module">${esc(question.module || "")}</div>${question.material ? `<section class="material">${question.material.title ? `<div class="material-title">${esc(question.material.title)}</div>` : ""}${esc(question.material.content || "")}</section>` : ""}<h1 class="question-title">${esc(question.stem)}</h1><div class="options">${question.options.map(option => `<button class="option" data-answer="${esc(option.key)}"><b>${esc(option.key)}.</b> ${esc(option.text)}</button>`).join("")}</div></article><section class="continue"><div><p>继续向下滚动，进入下一题</p><button class="secondary" id="continue">继续向下</button></div></section>`);
  bindAccount(current.user);
  app.querySelector("#refresh").onclick = async () => { await api("/api/study/refresh", "POST", {}); await load(); };
  app.querySelector("#special").onclick = () => void renderSpecialModules(true);
  app.querySelectorAll("[data-answer]").forEach(button => button.onclick = () => void submit(button.dataset.answer));
  app.querySelector("#continue").onclick = () => void forward();
  resumeTimer();
}

async function submit(answer) {
  if (answered || busy) return;
  answered = true; pauseTimer();
  const result = await api("/api/study/submit", "POST", { selectedAnswer: answer, submissionId: crypto.randomUUID(), answerDuration: Math.round(elapsed / 1000) });
  app.querySelectorAll("[data-answer]").forEach(button => {
    button.disabled = true;
    if (button.dataset.answer === answer) button.classList.add(result.isCorrect ? "correct" : "wrong");
    if (result.correctAnswer.includes(button.dataset.answer)) button.classList.add("correct");
  });
  app.insertAdjacentHTML("beforeend", `<section class="feedback"><strong>${result.isCorrect ? "回答正确" : "回答错误"}</strong><div>你的答案：${esc(answer)}</div><div>正确答案：${esc(result.correctAnswer.join("、"))}</div>${result.explanation ? `<div class="explanation"><b>解析</b><br>${esc(result.explanation)}</div>` : ""}</section>`);
}

async function startReview(user) { reviewMode = true; renderReview(await api("/api/study/wrong-review/start", "POST", {}), user); }
function renderReview(review, user = state.user) {
  answered = false; elapsed = 0; forwardArmed = false;
  if (review.state === "review_completed") { app.innerHTML = shell(`${topbar(user)}<section class="card completion"><span class="eyebrow">错题回顾</span><h1>本次回顾完成</h1><p class="muted">已回顾的题目不会在本次再次出现。</p><button class="primary" id="back-learning">返回学习</button></section>`); app.querySelector("#back-learning").onclick = async () => { await api("/api/study/wrong-review/leave", "POST", {}); reviewMode = false; renderIdle(user); }; return; }
  const q = review.question;
  app.innerHTML = shell(`${topbar(user)}<div><button class="quiet" id="leave-review">结束回顾</button></div><article><div class="module">${esc(q.module || "")}</div>${q.material ? `<section class="material">${q.material.title ? `<div class="material-title">${esc(q.material.title)}</div>` : ""}${esc(q.material.content || "")}</section>` : ""}<h1 class="question-title">${esc(q.stem)}</h1><div class="options">${q.options.map(o => `<button class="option" data-answer="${esc(o.key)}"><b>${esc(o.key)}.</b> ${esc(o.text)}</button>`).join("")}</div></article><section class="continue"><div><p>继续向下滚动，进入下一题</p><button class="secondary" id="continue">继续向下</button></div></section>`);
  bindAccount(user); app.querySelector("#leave-review").onclick = async () => { await api("/api/study/wrong-review/leave", "POST", {}); reviewMode = false; renderIdle(user); }; app.querySelectorAll("[data-answer]").forEach(b => b.onclick = () => void submitReview(q.externalId, b.dataset.answer)); app.querySelector("#continue").onclick = () => void forward(); resumeTimer();
}
async function submitReview(questionExternalId, answer) { if (answered || busy) return; answered = true; pauseTimer(); const result = await api("/api/study/wrong-review/submit", "POST", { questionExternalId, selectedAnswer: answer, submissionId: crypto.randomUUID(), answerDuration: Math.round(elapsed / 1000) }); app.querySelectorAll("[data-answer]").forEach(b => { b.disabled = true; if (b.dataset.answer === answer) b.classList.add(result.isCorrect ? "correct" : "wrong"); if (result.correctAnswer.includes(b.dataset.answer)) b.classList.add("correct"); }); app.insertAdjacentHTML("beforeend", `<section class="feedback"><strong>${result.isCorrect ? "回答正确，已移出错题本" : "回答错误，保留在错题本"}</strong><div>正确答案：${esc(result.correctAnswer.join("、"))}</div>${result.explanation ? `<div class="explanation"><b>解析</b><br>${esc(result.explanation)}</div>` : ""}</section>`); }
async function renderStatus(user, range) { reviewMode = false; const s = await api(`/api/study/status?range=${range}`); app.innerHTML = shell(`${topbar(user)}<section class="card completion"><span class="eyebrow">学习状态 · 噜噜</span><h1>学习记录</h1><div class="facts"><div class="fact"><span>已作答</span><b>${s.answeredCount}</b></div><div class="fact"><span>正确率</span><b>${s.accuracy == null ? "—" : `${Math.round(s.accuracy * 100)}%`}</b></div><div class="fact"><span>累计作答</span><b>${s.answerDuration} 秒</b></div><div class="fact"><span>当前错题</span><b>${s.wrongCountCurrent}</b></div></div><div class="secondary-actions"><button class="text-button" id="d7">7D</button><button class="text-button" id="all">ALL</button><button class="text-button" id="review">错题回顾</button><button class="text-button" id="wrong-book">错题本</button><button class="text-button" id="back">返回学习</button></div></section>`); app.querySelector("#d7").onclick = () => void renderStatus(user, "7d"); app.querySelector("#all").onclick = () => void renderStatus(user, "all"); app.querySelector("#review").onclick = () => void startReview(user); app.querySelector("#wrong-book").onclick = () => void renderWrongBook(user); app.querySelector("#back").onclick = () => void renderIdle(user); }
async function renderWrongBook(user) { const d = await api("/api/study/wrong-questions"); app.innerHTML = shell(`${topbar(user)}<section class="card"><span class="eyebrow">错题本</span><h1>当前错题</h1>${d.questionExternalIds.length ? d.questionExternalIds.map(id => `<div class="wrong-row"><span>${esc(id)}</span><button class="text-button" data-remove="${esc(id)}">移出</button></div>`).join("") : `<p class="muted">现在没有错题。</p>`}<button class="text-button" id="back">返回学习状态</button></section>`); app.querySelectorAll("[data-remove]").forEach(b => b.onclick = async () => { await api("/api/study/wrong-questions/remove", "POST", { questionExternalId: b.dataset.remove }); await renderWrongBook(user); }); app.querySelector("#back").onclick = () => void renderStatus(user, "all"); }
async function renderHistory(user) { const d = await api("/api/study/history"); app.innerHTML = shell(`${topbar(user)}<section class="card"><span class="eyebrow">训练历史</span><h1>每次训练</h1>${d.sessions.length ? d.sessions.map(x => `<div class="history-row"><div><b>${x.type === "special" ? "专项训练" : "普通训练"}</b><span>${x.status === "completed" ? "已完成" : x.status === "ended" ? "提前结束" : x.status === "invalidated" ? "已撤销" : "进行中"} · 已作答 ${x.completion.answeredCount} · ${x.completion.answerDuration} 秒</span></div>${x.status !== "invalidated" ? `<button class="text-button" data-invalidate="${esc(x.id)}">撤销这次训练</button>` : ""}</div>`).join("") : `<p class="muted">还没有训练记录。</p>`}<button class="text-button" id="back">返回学习</button></section>`); app.querySelectorAll("[data-invalidate]").forEach(b => b.onclick = async () => { await api("/api/study/history/invalidate", "POST", { sessionId: b.dataset.invalidate }); await renderHistory(user); }); app.querySelector("#back").onclick = () => void renderIdle(user); }

async function load() {
  pauseTimer(); state = await api("/api/study/current");
  if (state.state === "no_user") return renderCreateUser();
  if (state.state === "idle") return renderIdle(state.user);
  if (state.state === "completed") return renderCompleted(state);
  renderQuestion(state);
}

void load().catch(error => { app.innerHTML = shell(errorView(error)); });
