const app = document.querySelector("#app");
let state, answered = false, startedAt = 0, elapsed = 0, forwardArmed = false, busy = false, touchStartY = 0;

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
  try { await api("/api/study/forward", "POST", {}); await load(); } catch (error) { app.insertAdjacentHTML("beforeend", errorView(error)); } finally { busy = false; }
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
  app.innerHTML = shell(`${topbar(user)}<section class="intro"><h1>开始学习</h1><p>准备好后直接开始，本次会从题目本身开始。</p><button class="primary" id="start">开始学习</button></section><section class="card"><span class="eyebrow">专项训练</span><p class="muted">选择一个模块，开始一组专门练习。</p><div class="module-picker">${modules.map(module => `<button data-module="${esc(module)}">${esc(module)}</button>`).join("")}</div></section>`);
  bindAccount(user);
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

async function load() {
  pauseTimer(); state = await api("/api/study/current");
  if (state.state === "no_user") return renderCreateUser();
  if (state.state === "idle") return renderIdle(state.user);
  if (state.state === "completed") return renderCompleted(state);
  renderQuestion(state);
}

void load().catch(error => { app.innerHTML = shell(errorView(error)); });
