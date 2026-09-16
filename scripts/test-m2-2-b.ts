import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createUser, initializeUserData } from "../src/lib/user-data.ts";
import { importQuestionBankV1 } from "../src/lib/study-question-bank.ts";
import { createPlannedSession } from "../src/lib/session-planner.ts";
import { forwardCurrent, getCompletionStats, resumeSession, submitCurrentAnswer } from "../src/lib/session-runner.ts";

async function main() {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"gongkao-m2-2-b-")), userDataFile=path.join(root,"user.db"),questionBankFile=path.join(root,"bank.db");
  await initializeUserData(userDataFile); await importQuestionBankV1(JSON.parse(await fs.readFile(path.join(process.cwd(),"fixtures/import-trials/fei98/question-bank-v1.json"),"utf8")),questionBankFile);
  const user=await createUser({nickname:"runner"},userDataFile);
  const created=await createPlannedSession({userId:user.id,type:"special",module:"判断推理",userDataFile,questionBankFile});
  const first=await resumeSession({userId:user.id,userDataFile,questionBankFile}); assert.ok(first?.question);
  const answer=await submitCurrentAnswer({userId:user.id,userDataFile,questionBankFile,selectedAnswer:first!.question!.options[0].key,cumulativeAnswerDuration:20,submissionId:"first"});
  assert.ok(answer.attempt); assert.equal((await resumeSession({userId:user.id,userDataFile,questionBankFile}))?.question?.externalId,first?.question?.externalId);
  await forwardCurrent({userId:user.id,userDataFile,questionBankFile});
  const stats=await getCompletionStats(created.session.id,userDataFile); assert.equal(stats.answeredCount,1);assert.equal(stats.answerDuration,20);
  for(;;){const current=await resumeSession({userId:user.id,userDataFile,questionBankFile});if(!current?.question)break;await forwardCurrent({userId:user.id,userDataFile,questionBankFile});}
  assert.equal((await getCompletionStats(created.session.id,userDataFile)).traversedCount,10);
  console.log("M2.2-B tests: PASS");
}void main();
