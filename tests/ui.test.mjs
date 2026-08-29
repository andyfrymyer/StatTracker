import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import fs from "fs";
import { chromium } from "playwright";
const lines = fs.readFileSync(P("fixtures/sessions.csv"),"utf8").trim().split("\n").slice(1);
const n = v => (v===""||v===undefined)?null:Number(v);
const sessions = lines.map((l,i)=>{const r=l.split(",");return {id:"s"+i,type:"shooting",date:r[0],time:r[1],label:r[3],attempts:n(r[4]),makes:n(r[5]),swishes:n(r[6]),closeAttempts:n(r[7]),closeMakes:n(r[8]),closeSwishes:n(r[9]),midAttempts:n(r[10]),midMakes:n(r[11]),midSwishes:n(r[12]),longAttempts:n(r[13]),longMakes:n(r[14]),longSwishes:n(r[15]),spinRate:n(r[16]),releaseTime:n(r[17]),shotArc:n(r[18]),intensity:n(r[19]),duration:n(r[20]),shotForm:r[21],shotType:r[22],badges:null};});
let pass=0, fail=0;
const check=(nm,c,x)=>{ c?(pass++,console.log("  ok  "+nm)):(fail++,console.log("FAIL  "+nm,x??"")); };
const b = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await b.newContext({ viewport:{width:430,height:900} });
const p = await ctx.newPage();
await p.route("**/tesseract*.js", r=>r.abort());
await p.addInitScript(s=>{localStorage.setItem("ella-sessions-standalone",s);localStorage.setItem("ella-api-base-standalone","");},JSON.stringify(sessions));
await p.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1400);

// --- Calendar dates lead into the log --------------------------------------
const practised = p.locator("button.cal-day.practiced");
check("only practised days are buttons", await practised.count() === 3, await practised.count());
check("plain days stay unfocusable text", await p.locator("div.cal-day:not(.practiced)").count() > 20);
check("each has a label naming its date",
  (await practised.first().getAttribute("aria-label") || "").includes("session on"), await practised.first().getAttribute("aria-label"));
await practised.last().click();
await p.waitForTimeout(700);
const jumped = await p.evaluate(() => {
  const r = document.querySelector(".session-row.flash");
  if (!r) return null;
  const box = r.getBoundingClientRect();
  return { id: r.id, onScreen: box.top > -50 && box.top < window.innerHeight };
});
check("tapping a date flashes a session row", !!jumped, jumped);
check("and scrolls it into view", jumped && jumped.onScreen, jumped);
check("the row matches the tapped date",
  jumped && jumped.id === "session-s" + sessions.findIndex(s => s.date === "2026-08-27"), jumped && jumped.id);

// --- Shot form reads as a label, not a measurement --------------------------
const form = await p.evaluate(() => {
  const chip = document.querySelector(".form-chip");
  const value = document.querySelector(".trend-value");
  if (!chip || !value) return null;
  return { chipSize: parseFloat(getComputedStyle(chip).fontSize),
           valueSize: parseFloat(getComputedStyle(value).fontSize),
           text: chip.textContent.trim() };
});
check("shot form is a chip", form && form.text === "Inconsistent", form);
check("it no longer outweighs the figures beside it", form && form.chipSize < form.valueSize, form);

// --- A success and a failure look different ---------------------------------
const toastState = async (kind) => p.evaluate((k) => {
  showToast("test message", 4000, k);
  const t = document.getElementById("toast");
  return { classes: t.className, mark: t.querySelector(".toast-mark")?.textContent || "",
           bg: getComputedStyle(t).backgroundColor };
}, kind);
const okT = await toastState("ok"), errT = await toastState("error"), plainT = await toastState(undefined);
check("a success is marked", okT.mark === "✓" && okT.classes.includes("ok"), okT);
check("a failure is marked", errT.mark === "!" && errT.classes.includes("error"), errT);
check("they do not share a background", okT.bg !== errT.bg, { ok: okT.bg, error: errT.bg });
check("a plain acknowledgement carries no mark", plainT.mark === "", plainT);
check("toast text is escaped, not injected", await p.evaluate(() => {
  showToast('<img src=x onerror="window.__t=1">', 500);
  return !window.__t && !document.querySelector("#toast img");
}));
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
