import http from "node:http";
import { initializeApplicationData, questionBankFile } from "./lib/app-data.js";
import { getAllStudyQuestionIds, getStudyQuestion } from "./lib/study-question-bank.js";

const send = (res: http.ServerResponse, status: number, value: unknown) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value)); };

async function main() {
  await initializeApplicationData();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/") return send(res, 200, { name: "gongkao", status: "M2.1 data foundation ready" });
      if (url.pathname === "/api/questions") return send(res, 200, await getAllStudyQuestionIds(questionBankFile));
      if (url.pathname.startsWith("/api/questions/")) {
        const question = await getStudyQuestion(decodeURIComponent(url.pathname.slice(15)), questionBankFile);
        return send(res, question ? 200 : 404, question ?? { error: "Not found" });
      }
      return send(res, 404, { error: "Not found" });
    } catch (error) {
      return send(res, 500, { error: error instanceof Error ? error.message : "Server error" });
    }
  });
  server.listen(Number(process.env.PORT ?? 3000), () => console.log("Gongkao running at http://localhost:3000"));
}
void main();
