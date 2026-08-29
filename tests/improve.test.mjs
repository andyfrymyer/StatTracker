import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import fs from "fs";
import { chromium } from "playwright";
const fontCss = fs.readFileSync(P("vendor/fonts/fonts.local.css"),"utf8");
const lines = fs.readFileSync(P("fixtures/sessions.csv"),"utf8").trim().split("\n").slice(1);
const n = v => (v===""||v===undefined)?null:Number(v);
const sessions = lines.map((l,i)=>{const r=l.split(",");return {id:"s"+i,type:"shooting",date:r[0],time:r[1],label:r[3],attempts:n(r[4]),makes:n(r[5]),swishes:n(r[6]),closeAttempts:n(r[7]),closeMakes:n(r[8]),closeSwishes:n(r[9]),midAttempts:n(r[10]),midMakes:n(r[11]),midSwishes:n(r[12]),longAttempts:n(r[13]),longMakes:n(r[14]),longSwishes:n(r[15]),spinRate:n(r[16]),releaseTime:n(r[17]),shotArc:n(r[18]),intensity:n(r[19]),duration:n(r[20]),shotForm:r[21],shotType:r[22],badges:null};});
let pass=0, fail=0;
const check=(nm,c,x)=>{ c?(pass++,console.log("  ok  "+nm)):(fail++,console.log("FAIL  "+nm,x??"")); };
const b = await chromium.launch({executablePath: CHROMIUM});

async function open({ offline=false, prefs=null } = {}) {
  const ctx = await b.newContext({viewport:{width:430,height:1200},hasTouch:true});
  const p = await ctx.newPage();
  const errors=[]; p.on("pageerror",e=>errors.push(String(e)));
  await p.route("**/tesseract*.js", r=>r.abort());
  await p.route("**/fonts.googleapis.com/**", r=>r.fulfill({status:200,contentType:"text/css",body:fontCss}));
  await p.route("**/__fonts/*.woff2", r=>{const f=r.request().url().split("/").pop(); r.fulfill({status:200,contentType:"font/woff2",body:fs.readFileSync(P("vendor/fonts/"+f))});});
  // Offline case: the vendored chart file is unreachable too.
  if (offline) await p.route("**/chart.umd.min.js", r=>r.abort());
  if (prefs) {
    await p.route("**/api/prefs", r => r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(prefs)}));
    await p.route("**/api/sessions", r => r.fulfill({status:200,contentType:"application/json",body:JSON.stringify(sessions)}));
    await p.route("**/api/goals", r => r.fulfill({status:200,contentType:"application/json",body:JSON.stringify({shots:500,dribbleMinutes:30})}));
  }
  await p.addInitScript(([s,useApi])=>{localStorage.setItem("ella-sessions-standalone",s);
    localStorage.setItem("ella-api-base-standalone", useApi ? "https://api.test" : "");}, [JSON.stringify(sessions), !!prefs]);
  await p.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1600);
  return { p, ctx, errors };
}

// --- 1. Chart.js is now local, and its absence is survivable ---------------
{
  const { p, ctx, errors } = await open();
  check("charts draw with the vendored file", await p.evaluate(()=>{const c=document.querySelector("canvas");
    return !!c && c.getContext("2d").getImageData(0,0,c.width,c.height).data.some(v=>v!==0);}));
  check("online: no JS errors", errors.length===0, errors.slice(0,2));
  await ctx.close();
}
{
  const { p, ctx, errors } = await open({ offline:true });
  const t = await p.locator("#app").innerText();
  check("offline: page still renders", t.length>200);
  check("offline: hero still shows", /50\.5/.test(t));
  check("offline: no uncaught error", errors.length===0, errors.slice(0,2));
  check("offline: reminder still rendered (maybeNotify not blocked)", /practice reminder/i.test(t));
  await ctx.close();
}

// --- 2. Pace ignores a goal with nothing behind it -------------------------
{
  const { p, ctx } = await open();
  const pace = await p.evaluate(()=>{ const d=computeDerived();
    return { withTracks: computePace(d.thisWeek, state.goals, tracksOf(d)),
             tracks: tracksOf(d) }; });
  check("dribbling is not tracked (none logged)", pace.tracks.dribbling===false, pace.tracks);
  check("dribble goal no longer counts against pace", pace.withTracks.dribbleBehind===0, pace.withTracks);
  const t = await p.locator("#app").innerText();
  check("banner stops naming DribbleUp minutes", !/more dribbleup min/i.test(t));
  await ctx.close();
}

// --- 6. A metric reading 0 every session is flagged ------------------------
{
  const { p, ctx } = await open();
  const suspect = await p.evaluate(()=>computeDerived().suspectMechanics);
  check("release time flagged as a likely capture problem", suspect.includes("Release time"), suspect);
  check("spin rate not flagged (it varies)", !suspect.includes("Spin rate"), suspect);
  const t = (await p.locator("#app").innerText()).toLowerCase();
  check("flag is shown on the page", t.includes("never rose above 1% in any session logged"));
  await ctx.close();
}

// --- 3. Swap close/mid on a saved session ---------------------------------
{
  const { p, ctx } = await open();
  // Rows render newest-first, so the top row is the last entry in state.sessions.
  const newest = await p.evaluate(()=>{const s=[...state.sessions].sort((a,b)=>b.date.localeCompare(a.date))[0];
    return {id:s.id,c:s.closeAttempts,m:s.midAttempts};});
  // The swap moved in with the edit and delete icons and lost its text label.
  await p.locator('button[aria-label^="Swap Close"]').first().click();
  await p.waitForTimeout(500);
  const after = await p.evaluate(id=>{const s=state.sessions.find(x=>x.id===id); return {c:s.closeAttempts,m:s.midAttempts};}, newest.id);
  check("swap exchanges close and mid on a saved session", after.c===newest.m && after.m===newest.c, {newest,after});
  const stored = await p.evaluate(id=>JSON.parse(localStorage.getItem("ella-sessions-standalone")).find(x=>x.id===id), newest.id);
  check("swap persists to storage", stored.closeAttempts===newest.m, stored.closeAttempts);
  const others = await p.evaluate(id=>state.sessions.filter(x=>x.id!==id).map(x=>x.closeAttempts), newest.id);
  check("swap touches only that session", JSON.stringify(others)==="[105,139,89]", others);
  await ctx.close();
}

// --- 5. Session notes ------------------------------------------------------
{
  const { p, ctx } = await open();
  await p.locator("text=Log Session").click(); await p.waitForTimeout(500);
  check("notes field exists on the log form", await p.locator("#f-notes").count()===1);
  await p.locator("#f-notes").fill("Outdoor, windy, first session back");
  check("notes reach state", (await p.evaluate(()=>state.notes)).includes("windy"));
  await ctx.close();
}

// --- 4. Prefs arrive from the server ---------------------------------------
{
  const { p, ctx } = await open({ prefs: { profile:"14U combo guard, plays up", coachNote:{ summary:"From the server.", focus:"Mid-range", sessionCount:4 } } });
  check("profile pulled from the server", (await p.evaluate(()=>state.profile)).includes("plays up"));
  check("coach note pulled from the server", (await p.evaluate(()=>state.coachNote.summary))==="From the server.");
  const t = await p.locator("#app").innerText();
  check("server note is rendered", t.includes("From the server."));
  check("footer reflects that prefs sync", /player context and the coach's note sync/i.test(t));
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
