import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import fs from "fs";
import { chromium } from "playwright";
// The three outcomes were collapsed into one message telling everyone to open
// browser settings — useless on an iPhone in a Safari tab, where the request
// is refused with no prompt because the app is not on the Home Screen.
const lines = fs.readFileSync(P("fixtures/sessions.csv"),"utf8").trim().split("\n").slice(1);
const n = v => (v===""||v===undefined)?null:Number(v);
const sessions = lines.map((l,i)=>{const r=l.split(",");return {id:"s"+i,type:"shooting",date:r[0],time:r[1],label:r[3],attempts:n(r[4]),makes:n(r[5]),swishes:n(r[6]),closeAttempts:n(r[7]),closeMakes:n(r[8]),closeSwishes:n(r[9]),midAttempts:n(r[10]),midMakes:n(r[11]),midSwishes:n(r[12]),longAttempts:n(r[13]),longMakes:n(r[14]),longSwishes:n(r[15]),spinRate:n(r[16]),releaseTime:n(r[17]),shotArc:n(r[18]),intensity:n(r[19]),duration:n(r[20]),shotForm:r[21],shotType:r[22],badges:null};});
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

let pass=0, fail=0;
const check=(nm,c,x)=>{ c?(pass++,console.log("  ok  "+nm)):(fail++,console.log("FAIL  "+nm,x??"")); };
const b = await chromium.launch({ executablePath: CHROMIUM });

async function open({ ua, standalone=false, perm="denied" } = {}) {
  const ctx = await b.newContext(ua ? { userAgent: ua, viewport:{width:390,height:844} } : { viewport:{width:430,height:900} });
  const p = await ctx.newPage();
  await p.route("**/tesseract*.js", r=>r.abort());
  await p.addInitScript(([s, standalone, perm]) => {
    localStorage.setItem("ella-sessions-standalone", s);
    localStorage.setItem("ella-api-base-standalone", "");
    if (standalone) Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    // Stand in for the browser's own dialog so the outcome is controllable.
    window.Notification = function () {};
    window.Notification.permission = perm;
    window.Notification.requestPermission = () => Promise.resolve(perm);
  }, [JSON.stringify(sessions), standalone, perm]);
  await p.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1200);
  return { p, ctx };
}
const tapAndRead = async (p) => {
  await p.locator(".reminder-toggle").first().click();
  await p.waitForTimeout(300);
  return (await p.locator("#toast").innerText()).toLowerCase();
};

{ // iPhone, Safari tab — the case in the screenshot
  const { p, ctx } = await open({ ua: IPHONE, standalone: false });
  const label = (await p.locator(".reminder-toggle").first().innerText()).toLowerCase();
  check("iOS tab: the button says what is actually needed", label.includes("home screen"), label);
  const t = await tapAndRead(p);
  check("iOS tab: explains Add to Home Screen", t.includes("home screen") && t.includes("share"), t);
  check("iOS tab: does not send them to browser settings", !t.includes("browser settings") && !t.includes("blocked"), t);
  await ctx.close();
}
{ // iPhone, installed to the Home Screen, permission genuinely refused
  const { p, ctx } = await open({ ua: IPHONE, standalone: true, perm: "denied" });
  const label = (await p.locator(".reminder-toggle").first().innerText()).toLowerCase();
  check("installed: the button offers to enable", label.includes("enable"), label);
  const t = await tapAndRead(p);
  check("denied: points at this site's settings", t.includes("settings for this site"), t);
  await ctx.close();
}
{ // Prompt dismissed rather than refused — asking again works
  const { p, ctx } = await open({ perm: "default" });
  const t = await tapAndRead(p);
  check("dismissed: says to tap again, not that it is blocked", t.includes("tap again") && !t.includes("blocked"), t);
  await ctx.close();
}
{ // Allowed
  const { p, ctx } = await open({ perm: "granted" });
  const t = await tapAndRead(p);
  check("granted: reminders on", t.includes("reminders on"), t);
  check("granted: the toggle flips to off", (await p.locator(".reminder-toggle").first().innerText()).toLowerCase().includes("turn off"));
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
