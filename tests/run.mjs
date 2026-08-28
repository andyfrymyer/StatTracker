// Serves the app, extracts the pure functions, then runs every suite.
import { spawn } from "child_process";
import http from "http";
import fs from "fs";
import path from "path";
import { P, BASE } from "./lib/env.mjs";

const ROOT = P("..");
const PORT = Number(new URL(BASE).port || 80);
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".json":"application/json",
                ".png":"image/png", ".css":"text/css", ".woff2":"font/woff2" };

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end("not found");
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

const SUITES = ["test.mjs", "hang.mjs", "payload.test.mjs", "dupe.test.mjs", "render.test.mjs",
                "real.render.mjs", "swipe.test.mjs", "improve.test.mjs", "contrast.mjs"];

// Must be async: spawnSync would block this process's event loop, and the
// server above lives in it — the suites would then sit waiting on a page that
// could never be served.
const run = (file) => new Promise((resolve) => {
  spawn(process.execPath, [P(file)], { stdio: "inherit", env: process.env })
    .on("close", (code) => resolve(code));
});

await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
if (await run("lib/extract.mjs") !== 0) { server.close(); process.exit(1); }

let failed = [];
for (const suite of SUITES) {
  process.stdout.write(`\n── ${suite}\n`);
  if (await run(suite) !== 0) failed.push(suite);
}
server.close();
console.log(failed.length ? `\nFAILED: ${failed.join(", ")}` : "\nAll suites passed.");
process.exit(failed.length ? 1 : 0);
