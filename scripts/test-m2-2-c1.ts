import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { createStudyServer } from "../src/server.ts";
import { initializeUserData } from "../src/lib/user-data.ts";
import { importQuestionBankV1 } from "../src/lib/study-question-bank.ts";

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gongkao-m2-2-c1-"));
  const userDataFile = path.join(root, "user.db"), questionBankFile = path.join(root, "bank.db");
  await initializeUserData(userDataFile);
  await importQuestionBankV1(JSON.parse(await fs.readFile(path.join(process.cwd(), "fixtures", "import-trials", "fei98", "question-bank-v1.json"), "utf8")), questionBankFile);
  const server = createStudyServer({ userDataFile, questionBankFile });
  server.listen(0); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const request = async (pathname: string, method = "GET", body?: unknown) => {
    const response = await fetch(`${base}${pathname}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() as Record<string, any> };
  };
  try {
    assert.equal((await request("/api/study/current")).body.state, "no_user");
    const userA = (await request("/api/study/user", "POST", { nickname: "用户A" })).body.user;
    assert.equal((await request("/api/study/current")).body.state, "idle");
    const started = await request("/api/study/start", "POST", {});
    assert.equal(started.body.state, "ongoing");
    assert.equal("correctAnswer" in started.body.question, false, "未作答题目不能泄露答案");
    assert.equal("explanation" in started.body.question, false, "未作答题目不能泄露解析");
    const option = started.body.question.options[0].key;
    const submitted = await request("/api/study/submit", "POST", { selectedAnswer: option, submissionId: "answer-1", answerDuration: 8 });
    assert.equal(submitted.status, 200); assert.equal(submitted.body.submittedAnswer, option);
    assert.ok(Array.isArray(submitted.body.correctAnswer)); assert.ok("explanation" in submitted.body);
    assert.equal((await request("/api/study/forward", "POST", {})).body.state, "ongoing");
    const userB = (await request("/api/study/user", "POST", { nickname: "用户B" })).body.user;
    assert.equal((await request("/api/study/current")).body.state, "idle", "新用户不应看到用户A的训练");
    await request("/api/study/user/active", "POST", { userId: userA.id });
    assert.equal((await request("/api/study/current")).body.state, "ongoing", "切回用户A应恢复其进行中的训练");
    const modules = (await request("/api/study/modules")).body as unknown as string[];
    assert.ok(modules.length > 0);
    assert.equal((await request("/api/study/special", "POST", { module: modules[0] })).status, 409);
    const special = await request("/api/study/special", "POST", { module: modules[0], replaceCurrent: true });
    assert.equal(special.body.state, "ongoing"); assert.equal(special.body.sessionType, "special");
    let progress = special.body;
    while (progress.state === "ongoing") progress = (await request("/api/study/forward", "POST", {})).body;
    assert.equal(progress.state, "completed", "未作答也可持续前进至完成页");
    assert.equal(progress.completion.answeredCount, 0);
    const users = await request("/api/study/users");
    assert.deepEqual(users.body.users.map((user: { id: string }) => user.id).sort(), [userA.id, userB.id].sort());
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  console.log("M2.2-C1 tests: PASS");
}
void main();
