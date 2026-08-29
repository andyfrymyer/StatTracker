import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import fs from "fs";
import { chromium } from "playwright";
// Session notes and player context are typed by hand and sync between devices,
// and an imported JSON file can carry anything, so nothing from storage, the
// API or the model may reach the DOM as markup.
const src = fs.readFileSync(P(".build/payload.js"), "utf8");
const { esc } = new Function("state", src + "; return {esc};")({ sessions: [], goals: {} });

let pass = 0, fail = 0;
const check = (n, c, x) => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n, x ?? "")); };

check("escapes angle brackets", esc("<b>x</b>") === "&lt;b&gt;x&lt;/b&gt;", esc("<b>x</b>"));
check("escapes quotes for attributes", esc(`a"b'c`) === "a&quot;b&#39;c", esc(`a"b'c`));
check("escapes ampersand first, no double-encoding", esc("a & <b") === "a &amp; &lt;b", esc("a & <b"));
check("null and undefined become empty", esc(null) === "" && esc(undefined) === "");
check("numbers survive", esc(42) === "42");

const XSS = '<img src=x onerror="window.__pwned=1">';
const sessions = [{ id:"a", type:"shooting", date:"2026-08-16", time:"10:00",
  label: XSS, attempts:250, makes:112, swishes:42,
  closeAttempts:105, closeMakes:51, midAttempts:144, midMakes:60, longAttempts:1, longMakes:0,
  shotType: XSS, shotForm:"Consistent", notes: XSS,
  badges:[{ name: XSS, grade:"A+", zone:"close" }] }];
const NOTE = { summary: XSS, focus: XSS, progress: XSS, dataGaps: XSS,
  plan:[{ drill: XSS, target: XSS, why: XSS }],
  goals:{ shots:500, dribbleMinutes:30, rationale: XSS }, sessionCount:1 };

const b = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await b.newContext({ viewport:{ width:430, height:1200 } });
const p = await ctx.newPage();
await p.route("**/tesseract*.js", r => r.abort());
await p.route("**/fonts.googleapis.com/**", r => r.abort());
await p.addInitScript(([s, n]) => {
  localStorage.setItem("ella-sessions-standalone", s);
  localStorage.setItem("ella-coach-note-standalone", n);
  localStorage.setItem("ella-profile-standalone", '</textarea><img src=x onerror="window.__pwned=1">');
  localStorage.setItem("ella-api-base-standalone", "");
}, [JSON.stringify(sessions), JSON.stringify(NOTE)]);
await p.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1200);

check("no injected element on the dashboard", await p.evaluate(() => !window.__pwned && !document.querySelector("#app img")));
check("payload shows as literal text", (await p.locator("#app").innerText()).includes("<img src=x"));
// The profile card lives on the dashboard, so check it before switching tabs.
check("profile cannot break out of its textarea",
  await p.evaluate(() => { const t = document.querySelector("#f-profile");
    return !!t && t.value.startsWith("</textarea>"); }));
await p.locator("text=Log Session").click(); await p.waitForTimeout(600);
check("no injected element on the log form", await p.evaluate(() => !window.__pwned && !document.querySelector("#app img")));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
