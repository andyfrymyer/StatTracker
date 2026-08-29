import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import fs from "fs";
import { chromium } from "playwright";
const lines = fs.readFileSync(P("fixtures/sessions.csv"),"utf8").trim().split("\n").slice(1);
const n = v => (v===""||v===undefined)?null:Number(v);
const sessions = lines.map((l,i)=>{const r=l.split(",");return {id:"s"+i,type:"shooting",date:r[0],time:r[1],label:r[3],attempts:n(r[4]),makes:n(r[5]),swishes:n(r[6]),closeAttempts:n(r[7]),closeMakes:n(r[8]),closeSwishes:n(r[9]),midAttempts:n(r[10]),midMakes:n(r[11]),midSwishes:n(r[12]),longAttempts:n(r[13]),longMakes:n(r[14]),longSwishes:n(r[15]),spinRate:n(r[16]),releaseTime:n(r[17]),shotArc:n(r[18]),intensity:n(r[19]),duration:n(r[20]),shotForm:r[21],shotType:r[22],notes:i===3?"Outdoor, windy":null,badges:null};});
let pass=0, fail=0;
const check=(nm,c,x)=>{ c?(pass++,console.log("  ok  "+nm)):(fail++,console.log("FAIL  "+nm,x??"")); };
const b = await chromium.launch({ executablePath: CHROMIUM });

async function open(extra = []) {
  const ctx = await b.newContext({ viewport:{width:430,height:900} });
  const p = await ctx.newPage();
  await p.route("**/tesseract*.js", r=>r.abort());
  await p.addInitScript(s=>{localStorage.setItem("ella-sessions-standalone",s);localStorage.setItem("ella-api-base-standalone","");},
    JSON.stringify([...sessions, ...extra]));
  await p.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1200);
  return { p, ctx };
}
const text = (p) => p.locator("#app").innerText();

// --- Opening one session ----------------------------------------------------
{
  const { p, ctx } = await open();
  await p.locator(".session-open").first().click();
  await p.waitForTimeout(400);
  const t = await text(p);
  check("the detail replaces the dashboard", !t.includes("Session Log"), t.slice(0, 60));
  check("it leads with that session's FG%", t.includes("50.5"), t.slice(0, 80));
  check("it shows that session's own zone split", t.includes("Close-range") && t.includes("50/79"), t.includes("50/79"));
  check("thin zones are not dressed up", !/long-range/i.test(t) || t.includes("too few to read"));
  check("mechanics are that session's", t.includes("Shot arc") && t.includes("69%"));
  check("the unreliable one is marked here too", t.includes("unreliable"));
  check("shot type is surfaced", t.toLowerCase().includes("relaxed"));
  check("notes appear, or say they are missing", t.includes("Nothing recorded") || t.includes("Outdoor"));
  await p.locator("text=‹ Back").first().click();
  await p.waitForTimeout(400);
  check("back returns to the dashboard", (await text(p)).includes("Session Log"));
  await ctx.close();
}
// --- The calendar opens it rather than scrolling ----------------------------
{
  const { p, ctx } = await open();
  await p.locator("button.cal-day.practiced").last().click();
  await p.waitForTimeout(500);
  check("a marked day opens the detail", (await p.evaluate(() => state.viewingId)) !== null);
  check("and it is that day's session",
    (await text(p)).includes("Aug 27"), (await text(p)).slice(0, 80));
  await ctx.close();
}
// --- Deleting asks first ----------------------------------------------------
{
  const { p, ctx } = await open();
  const native = []; p.on("dialog", async d => { native.push(d.type()); await d.dismiss(); });
  await p.locator(".session-open").first().click(); await p.waitForTimeout(300);
  await p.locator('[aria-label="Delete this session"]').click(); await p.waitForTimeout(400);
  check("delete asks before destroying", await p.locator(".dialog-sheet").count() === 1);
  check("no native confirm", native.length === 0, native);
  check("it names what will go", (await p.locator(".dialog-body").innerText()).includes("96/190"));
  await p.locator("#dialog-cancel").click(); await p.waitForTimeout(300);
  check("cancelling keeps it", await p.evaluate(() => state.sessions.length) === 4);
  await p.locator('[aria-label="Delete this session"]').click(); await p.waitForTimeout(300);
  await p.locator("#dialog-ok").click(); await p.waitForTimeout(500);
  check("confirming deletes it", await p.evaluate(() => state.sessions.length) === 3);
  check("and returns to the dashboard", (await text(p)).includes("Session Log"));
  await ctx.close();
}
// --- Dribbling stays out of the way until it is used ------------------------
{
  const { p, ctx } = await open();
  await p.locator("text=Log Session").click(); await p.waitForTimeout(500);
  const t = await text(p);
  check("no Shooting/Dribbling toggle with none logged", await p.locator(".seg-btn").count() === 0);
  check("but it is still reachable", t.includes("Log a DribbleUp session instead"));
  await p.locator("text=Log a DribbleUp session instead").click(); await p.waitForTimeout(400);
  check("the link switches to the dribbling form", (await text(p)).includes("Drill name"));
  check("and the toggle appears once you are there", await p.locator(".seg-btn").count() === 2);
  await ctx.close();
}
{
  const dribble = [{ id:"d1", type:"dribbling", date:"2026-08-28", time:"17:00", drillName:"Tight Handles", points:420, reps:300, duration:22, notes:null }];
  const { p, ctx } = await open(dribble);
  await p.locator("text=Log Session").click(); await p.waitForTimeout(500);
  check("with a dribbling session logged the toggle is back", await p.locator(".seg-btn").count() === 2);
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
