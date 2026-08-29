import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import fs from "fs";
import { chromium } from "playwright";
// prompt() and confirm() render as OS alerts in a standalone PWA and cannot
// mask what is typed, so nothing may fall back to them.
const lines = fs.readFileSync(P("fixtures/sessions.csv"),"utf8").trim().split("\n").slice(1);
const n = v => (v===""||v===undefined)?null:Number(v);
const sessions = lines.map((l,i)=>{const r=l.split(",");return {id:"s"+i,type:"shooting",date:r[0],time:r[1],label:r[3],attempts:n(r[4]),makes:n(r[5]),swishes:n(r[6]),closeAttempts:n(r[7]),closeMakes:n(r[8]),closeSwishes:n(r[9]),midAttempts:n(r[10]),midMakes:n(r[11]),midSwishes:n(r[12]),longAttempts:n(r[13]),longMakes:n(r[14]),longSwishes:n(r[15]),spinRate:n(r[16]),releaseTime:n(r[17]),shotArc:n(r[18]),intensity:n(r[19]),duration:n(r[20]),shotForm:r[21],shotType:r[22],badges:null};});
let pass=0, fail=0;
const check=(nm,c,x)=>{ c?(pass++,console.log("  ok  "+nm)):(fail++,console.log("FAIL  "+nm,x??"")); };
const b = await chromium.launch({ executablePath: CHROMIUM });

async function open(pin) {
  const ctx = await b.newContext({ viewport:{width:430,height:900} });
  const p = await ctx.newPage();
  const native = [];
  // If anything still reaches for a browser dialog, record it and dismiss.
  p.on("dialog", async d => { native.push(d.type()); await d.dismiss(); });
  await p.route("**/tesseract*.js", r=>r.abort());
  await p.addInitScript(([s, pin]) => {
    localStorage.setItem("ella-sessions-standalone", s);
    localStorage.setItem("ella-api-base-standalone", "");
    if (pin) localStorage.setItem("ella-pin-standalone", pin);
  }, [JSON.stringify(sessions), pin]);
  await p.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1200);
  return { p, ctx, native };
}

// --- Clearing everything asks in-app ---------------------------------------
{
  const { p, ctx, native } = await open(null);
  await p.locator("text=Clear all data").click();
  await p.waitForTimeout(400);
  check("an in-app sheet opens", await p.locator(".dialog-sheet").count() === 1);
  check("no browser dialog was used", native.length === 0, native);
  const body = await p.locator(".dialog-body").innerText();
  check("it says how much is at stake", body.includes("4 logged sessions"), body);
  check("it says it cannot be undone", body.toLowerCase().includes("cannot be undone"));
  check("the destructive action is styled as such", await p.locator(".btn-danger").count() === 1);
  await p.locator("#dialog-cancel").click(); await p.waitForTimeout(300);
  check("cancel closes it", await p.locator(".dialog-sheet").count() === 0);
  check("cancel kept the data", await p.evaluate(() => state.sessions.length) === 4);
  await p.locator("text=Clear all data").click(); await p.waitForTimeout(300);
  await p.locator("#dialog-ok").click(); await p.waitForTimeout(400);
  check("confirming clears", await p.evaluate(() => state.sessions.length) === 0);
  await ctx.close();
}
// --- A PIN gate that masks what is typed -----------------------------------
{
  const { p, ctx, native } = await open("1234");
  await p.locator("text=Clear all data").click();
  await p.waitForTimeout(400);
  check("a PIN is asked for in-app", await p.locator("#dialog-input").count() === 1);
  check("no browser prompt", native.length === 0, native);
  check("the PIN is masked", await p.locator("#dialog-input").getAttribute("type") === "password");
  check("a numeric keypad is requested", await p.locator("#dialog-input").getAttribute("inputmode") === "numeric");
  await p.locator("#dialog-input").fill("9999");
  await p.locator("#dialog-ok").click(); await p.waitForTimeout(400);
  check("a wrong PIN does not proceed", await p.evaluate(() => state.sessions.length) === 4);
  check("and it says so", (await p.locator("#toast").innerText()).toLowerCase().includes("wrong pin"));
  await p.locator("text=Clear all data").click(); await p.waitForTimeout(300);
  await p.locator("#dialog-input").fill("1234");
  await p.locator("#dialog-input").press("Enter"); await p.waitForTimeout(400);
  check("the right PIN reaches the confirm step", (await p.locator(".dialog-title").innerText()).includes("Clear all sessions"));
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  check("Escape closes it", await p.locator(".dialog-sheet").count() === 0);
  check("nothing was deleted", await p.evaluate(() => state.sessions.length) === 4);
  await ctx.close();
}
// --- Setting a PIN ----------------------------------------------------------
{
  const { p, ctx, native } = await open(null);
  await p.locator("text=Set a PIN").click(); await p.waitForTimeout(400);
  check("setting a PIN uses the sheet", await p.locator(".dialog-sheet").count() === 1);
  check("it is honest about what a PIN does",
    (await p.locator(".dialog-body").innerText()).toLowerCase().includes("not encryption"));
  await p.locator("#dialog-input").fill("12");
  await p.locator("#dialog-ok").click(); await p.waitForTimeout(400);
  check("a too-short PIN is refused", (await p.locator("#toast").innerText()).toLowerCase().includes("four digits"));
  check("and nothing was stored", await p.evaluate(() => localStorage.getItem("ella-pin-standalone")) === null);
  check("still no browser dialogs anywhere", native.length === 0, native);
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
