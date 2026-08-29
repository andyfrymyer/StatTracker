import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import fs from "fs";
import { chromium } from "playwright";
const lines = fs.readFileSync(P("fixtures/sessions.csv"),"utf8").trim().split("\n").slice(1);
const n = v => (v===""||v===undefined)?null:Number(v);
const sessions = lines.map((l,i)=>{const r=l.split(",");return {id:"s"+i,type:"shooting",date:r[0],time:r[1],label:r[3],attempts:n(r[4]),makes:n(r[5]),swishes:n(r[6]),closeAttempts:n(r[7]),closeMakes:n(r[8]),closeSwishes:n(r[9]),midAttempts:n(r[10]),midMakes:n(r[11]),midSwishes:n(r[12]),longAttempts:n(r[13]),longMakes:n(r[14]),longSwishes:n(r[15]),spinRate:n(r[16]),releaseTime:n(r[17]),shotArc:n(r[18]),intensity:n(r[19]),duration:n(r[20]),shotForm:r[21],shotType:r[22],badges:null};});
const NOTE = { progress:"Long range moved from 1 to 10.",
  plan:[{drill:"Elbow-to-elbow mid-range",target:"60 attempts",why:"Weakest zone."}],
  goals:{shots:550,dribbleMinutes:30,rationale:"Bump."}, dataGaps:null, sessionCount:4 };
let pass=0, fail=0;
const check=(nm,c,x)=>{ c?(pass++,console.log("  ok  "+nm)):(fail++,console.log("FAIL  "+nm,x??"")); };
const b = await chromium.launch({ executablePath: CHROMIUM });

async function open({ noteSessionCount = 4, holdApi = false } = {}) {
  const ctx = await b.newContext({ viewport:{width:430,height:900} });
  const p = await ctx.newPage();
  await p.route("**/tesseract*.js", r=>r.abort());
  await p.route("**/api/sessions", r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(sessions)}));
  await p.route("**/api/goals", r=>r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({shots:500,dribbleMinutes:30})}));
  await p.route("**/api/prefs", r=>r.fulfill({status:200,contentType:"application/json",body:"{}"}));
  // Never resolves, so the loading state can be observed rather than raced.
  if (holdApi) await p.route("**/api/coach-note", () => {});
  await p.addInitScript(([s, nt]) => {
    localStorage.setItem("ella-sessions-standalone", s);
    localStorage.setItem("ella-coach-note-standalone", nt);
    localStorage.setItem("ella-api-base-standalone", "https://api.test");
  }, [JSON.stringify(sessions), JSON.stringify({ ...NOTE, sessionCount: noteSessionCount })]);
  await p.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1300);
  return { p, ctx };
}

// --- The refresh is a button, and it says when it is due --------------------
{
  const { p, ctx } = await open({ noteSessionCount: 4 });
  const btn = p.locator(".note-refresh").first();
  check("refresh is a real button, not a text link", await btn.count() === 1);
  const box = await btn.boundingBox();
  check("it is a tappable size", box.height >= 28 && box.width >= 70, box);
  check("up to date: it does not shout", !(await btn.getAttribute("class")).includes("due"));
  check("up to date: reads Refresh", (await btn.innerText()).trim() === "Refresh", await btn.innerText());
  await ctx.close();
}
{
  const { p, ctx } = await open({ noteSessionCount: 2 });  // note has not seen 2 sessions
  const btn = p.locator(".note-refresh").first();
  check("stale: the button fills in", (await btn.getAttribute("class")).includes("due"));
  check("stale: it says why", (await btn.innerText()).toLowerCase().includes("new sessions"), await btn.innerText());
  const filled = await p.evaluate(() => getComputedStyle(document.querySelector(".note-refresh")).backgroundColor);
  check("stale: filled rather than outlined", filled === "rgb(16, 16, 16)", filled);
  await ctx.close();
}
// --- The card shows it is working ------------------------------------------
{
  const { p, ctx } = await open({ noteSessionCount: 2, holdApi: true });
  const before = await p.locator("#app").innerText();
  check("the old note is on screen first", before.includes("Elbow-to-elbow mid-range"));
  await p.locator(".note-refresh").first().click();
  await p.waitForTimeout(600);
  const during = await p.locator("#app").innerText();
  check("skeleton lines replace the note", await p.locator(".skeleton-line").count() >= 5, await p.locator(".skeleton-line").count());
  check("the stale note is not left sitting there", !during.includes("Elbow-to-elbow mid-range"));
  check("it says what is happening", during.toLowerCase().includes("reading every session"));
  check("the button shows a spinner", await p.locator(".note-refresh .spin").count() === 1);
  check("and cannot be tapped again", await p.locator(".note-refresh").first().isDisabled());
  await ctx.close();
}
// --- Import leads the log form ----------------------------------------------
{
  const { p, ctx } = await open();
  await p.locator("text=Log Session").click(); await p.waitForTimeout(500);
  const btn = p.locator(".import-card button").first();
  const box = await btn.boundingBox();
  check("import is above the fold", box.y < 700, box && box.y);
  check("import spans the width", box.width > 330, box && box.width);
  const bg = await btn.evaluate(el => getComputedStyle(el).backgroundColor);
  check("import is the primary action, not a ghost", bg === "rgb(16, 16, 16)", bg);
  const card = await p.locator(".import-card").evaluate(el => getComputedStyle(el).borderStyle);
  check("no dashed secondary framing", card !== "dashed", card);
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
