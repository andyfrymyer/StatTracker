import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import fs from "fs";
const state = { apiBase: "https://x.test", apiPin: "" };
const src = fs.readFileSync(P(".build/extracted.js"), "utf8");
// A fetch that never resolves unless the abort signal fires.
const fetchStub = (url, init) => new Promise((_, reject) => {
  init.signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; reject(e); });
});
const { apiFetch } = new Function("state","fetch", src + "; return {apiFetch};")(state, fetchStub);
const t0 = Date.now();
try { await apiFetch("/api/coach-note", { timeoutMs: 300 }); console.log("FAIL: did not abort"); process.exit(1); }
catch (e) {
  const dt = Date.now() - t0;
  const ok = e.status === 408 && dt >= 290 && dt < 1500;
  console.log(`${ok ? "  ok" : "FAIL"}  hanging request aborted after ${dt}ms with status ${e.status}`);
  process.exit(ok ? 0 : 1);
}
