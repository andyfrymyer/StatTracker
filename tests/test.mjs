import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import fs from "fs";
const state = { apiBase: "https://x.test/", apiPin: "1234" };
let calls = [];
globalThis.state = state;

const src = fs.readFileSync(P(".build/extracted.js"), "utf8");
const mk = new Function("state", "fetch", src + "; return {apiFetch, postCoachNote, coachErrorText};");

function harness(responder) {
  calls = [];
  const fetchStub = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init, calls.length);
  };
  return mk(state, fetchStub);
}
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });

let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) { pass++; console.log("  ok  " + name); } else { fail++; console.log("FAIL  " + name, extra ?? ""); } };

// 1. server {"error":...} body is surfaced, status attached
{
  const { apiFetch } = harness(() => json(502, '{"error":"AI response wasn\'t valid JSON"}'));
  try { await apiFetch("/api/coach-note", { method: "POST" }); check("502 throws", false); }
  catch (e) { check("502 message = server error", e.message === "AI response wasn't valid JSON", e.message);
              check("502 status attached", e.status === 502, e.status); }
}
// 2. non-JSON error body falls back to raw text
{
  const { apiFetch } = harness(() => json(500, "Internal Server Error"));
  try { await apiFetch("/x"); } catch (e) { check("plain-text body kept", e.message === "Internal Server Error", e.message); }
}
// 3. empty body falls back to "API <status>"
{
  const { apiFetch } = harness(() => json(504, ""));
  try { await apiFetch("/x"); } catch (e) { check("empty body -> API 504", e.message === "API 504", e.message); }
}
// 4. timeoutMs is stripped from fetch init, signal is set, url joined without double slash
{
  const { apiFetch } = harness(() => json(200, '{"ok":true}'));
  const r = await apiFetch("/api/coach-note", { method: "POST", timeoutMs: 120000, body: "{}" });
  check("success returns parsed json", r.ok === true, r);
  check("timeoutMs not passed to fetch", calls[0].init.timeoutMs === undefined, calls[0].init.timeoutMs);
  check("signal set", !!calls[0].init.signal);
  check("pin header sent", calls[0].init.headers["x-app-pin"] === "1234");
  check("url has no double slash", calls[0].url === "https://x.test/api/coach-note", calls[0].url);
}
// 5. abort -> 408
{
  const { apiFetch } = harness(async (u, init) => { await new Promise(r => setTimeout(r, 50));
    const e = new Error("aborted"); e.name = "AbortError"; throw e; });
  try { await apiFetch("/x", { timeoutMs: 10 }); }
  catch (e) { check("timeout -> status 408", e.status === 408, e.status);
              check("timeout message", /timed out after 0s/.test(e.message), e.message); }
}
// 6. network failure -> 0
{
  const { apiFetch } = harness(async () => { throw new TypeError("Failed to fetch"); });
  try { await apiFetch("/x"); } catch (e) { check("network -> status 0", e.status === 0, e.status); }
}
// 7. postCoachNote retries exactly once on 502, then succeeds
{
  const { postCoachNote } = harness((u, i, n) => n === 1 ? json(502, '{"error":"AI response wasn\'t valid JSON"}') : json(200, '{"summary":"ok"}'));
  const r = await postCoachNote({ sessions: [] });
  check("502 then success", r.summary === "ok", r);
  check("retried exactly once", calls.length === 2, calls.length);
  check("retry used 120s timeout", calls[1].init.timeoutMs === undefined);
}
// 8. postCoachNote does NOT retry a 401
{
  const { postCoachNote } = harness(() => json(401, '{"error":"Invalid or missing PIN"}'));
  try { await postCoachNote({}); check("401 throws", false); }
  catch (e) { check("401 not retried", calls.length === 1, calls.length); check("401 status", e.status === 401); }
}
// 9. two consecutive 502s give up
{
  const { postCoachNote } = harness(() => json(502, '{"error":"AI error (429)"}'));
  try { await postCoachNote({}); check("double 502 throws", false); }
  catch (e) { check("gives up after 2 tries", calls.length === 2, calls.length); }
}
// 10. coachErrorText mapping
{
  const { coachErrorText } = harness(() => json(200, "{}"));
  const t = (s, m) => coachErrorText(Object.assign(new Error(m || ""), { status: s }));
  check("503 text", t(503) === "AI analysis isn't set up on the server yet", t(503));
  check("401 text", /re-enter it under Cloud Sync/.test(t(401)), t(401));
  check("429 text uses server detail", t(429, "Too many failed attempts. Try again in 12 min.") === "Too many failed attempts. Try again in 12 min.", t(429, "x"));
  check("408 text", /timed out/.test(t(408)), t(408));
  check("0 text", /Can't reach the server/.test(t(0)), t(0));
  check("502 includes detail", t(502, "AI response wasn't valid JSON") === "Server couldn't finish the AI analysis (AI response wasn't valid JSON)", t(502, "AI response wasn't valid JSON"));
  check("unknown status", t(418, "teapot") === "Couldn't get AI analysis — teapot", t(418, "teapot"));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
