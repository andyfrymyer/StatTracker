import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import fs from "fs";
import { chromium } from "playwright";
const lines = fs.readFileSync(P("fixtures/sessions.csv"),"utf8").trim().split("\n").slice(1);
const n = v => (v===""||v===undefined)?null:Number(v);
const sessions = lines.map((l,i)=>{const r=l.split(",");return {id:"s"+i,type:"shooting",date:r[0],time:r[1],label:r[3],attempts:n(r[4]),makes:n(r[5]),swishes:n(r[6]),closeAttempts:n(r[7]),closeMakes:n(r[8]),closeSwishes:n(r[9]),midAttempts:n(r[10]),midMakes:n(r[11]),midSwishes:n(r[12]),longAttempts:n(r[13]),longMakes:n(r[14]),longSwishes:n(r[15]),spinRate:n(r[16]),releaseTime:n(r[17]),shotArc:n(r[18]),intensity:n(r[19]),duration:n(r[20]),shotForm:r[21],shotType:r[22],badges:null};});
let pass=0, fail=0;
const check=(nm,c,x)=>{ c?(pass++,console.log("  ok  "+nm)):(fail++,console.log("FAIL  "+nm,x??"")); };
const b = await chromium.launch({executablePath: CHROMIUM});

async function open({ offline=false, empty=false } = {}) {
  const ctx = await b.newContext({viewport:{width:430,height:1000},deviceScaleFactor:2});
  const p = await ctx.newPage();
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.route("**/tesseract*.js", r=>r.abort());
  // Nothing may reach the network for fonts any more; fail loudly if it tries.
  let hitNetwork = false;
  await p.route("**://fonts.googleapis.com/**", r=>{ hitNetwork = true; r.abort(); });
  await p.route("**://fonts.gstatic.com/**", r=>{ hitNetwork = true; r.abort(); });
  if (offline) await p.route("**/chart.umd.min.js", r=>r.abort());
  await p.addInitScript(([s,e])=>{ if(!e) localStorage.setItem("ella-sessions-standalone",s);
    localStorage.setItem("ella-api-base-standalone",""); }, [JSON.stringify(sessions), empty]);
  await p.goto(BASE + "/index.html",{waitUntil:"domcontentloaded"});
  await p.waitForTimeout(1500);
  return { p, ctx, errs, net: () => hitNetwork };
}

// --- Fonts -----------------------------------------------------------------
{
  const { p, ctx, errs, net } = await open();
  check("no request to Google Fonts", !net());
  check("Barlow italic 800 is loaded", await p.evaluate(()=>document.fonts.check("800 italic 60px 'Barlow Condensed'")));
  check("Barlow 700 upright is loaded", await p.evaluate(()=>document.fonts.check("700 30px 'Barlow Condensed'")));
  check("Inter 400 and 700 both resolve", await p.evaluate(()=>document.fonts.check("400 14px Inter") && document.fonts.check("700 14px Inter")));
  check("hero really renders in Barlow", await p.evaluate(()=>getComputedStyle(document.querySelector(".hero-value")).fontFamily.includes("Barlow")));
  const faces = await p.evaluate(()=>Array.from(document.fonts).filter(f=>f.status==="loaded").length);
  check("faces actually loaded, not fallbacks", faces >= 2, faces);
  check("no JS errors", errs.length===0, errs.slice(0,2));
  await ctx.close();
}
// --- Offline keeps the typography -----------------------------------------
{
  const { p, ctx, net } = await open({ offline:true });
  check("offline: still no font network call", !net());
  check("offline: hero still Barlow", await p.evaluate(()=>document.fonts.check("800 italic 60px 'Barlow Condensed'")));
  await ctx.close();
}
// --- Log form --------------------------------------------------------------
{
  const { p, ctx, errs } = await open();
  await p.locator("text=Log Session").click(); await p.waitForTimeout(600);
  const box = await p.locator("#f-notes").boundingBox();
  check("notes field is full width, not squeezed into the date row", box.width > 300, box && box.width);
  const dateBox = await p.locator("#f-date").boundingBox();
  check("date field is half width beside time", dateBox.width > 150 && dateBox.width < 260, dateBox && dateBox.width);
  check("notes sits below the numbers", box.y > dateBox.y + 200, { notes: box.y, date: dateBox.y });
  const t = await p.locator("#app").innerText();
  check("form has section headings", t.includes("Shots by distance") && t.includes("Shot mechanics"));
  check("log form: no JS errors", errs.length===0, errs.slice(0,2));
  const h = await p.evaluate(()=>document.getElementById("app").scrollHeight);
  console.log("   log form height:", h, "px");
  await p.screenshot({path: P(".build/new-log.png"), clip:{x:0,y:0,width:430,height:900}});
  await ctx.close();
}
// --- Every field must be visible against whatever is behind it -------------
{
  const { p, ctx } = await open();
  const invisible = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll(".input")) {
      const cs = getComputedStyle(el);
      let par = el.parentElement, behind = "rgb(255, 255, 255)";
      while (par) { const c = getComputedStyle(par).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)/.test(c)) { behind = c; break; } par = par.parentElement; }
      const borderInvisible = /rgba\(0, 0, 0, 0\)/.test(cs.borderColor) || cs.borderStyle === "none";
      if (cs.backgroundColor === behind && borderInvisible) out.push(el.id || el.tagName);
    }
    return out;
  });
  check("no field is the same colour as its container with no border", invisible.length === 0, invisible);
  await ctx.close();
}
{
  const { p, ctx } = await open();
  await p.locator("text=Log Session").click(); await p.waitForTimeout(600);
  const invisible = await p.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll(".input")) {
      const cs = getComputedStyle(el);
      let par = el.parentElement, behind = "rgb(255, 255, 255)";
      while (par) { const c = getComputedStyle(par).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)/.test(c)) { behind = c; break; } par = par.parentElement; }
      const borderInvisible = /rgba\(0, 0, 0, 0\)/.test(cs.borderColor) || cs.borderStyle === "none";
      if (cs.backgroundColor === behind && borderInvisible) out.push(el.id || el.tagName);
    }
    return out;
  });
  check("log form: no invisible fields either", invisible.length === 0, invisible);
  await ctx.close();
}
// --- Nothing that can only ever read empty ---------------------------------
{
  const { p, ctx } = await open();
  const t = await p.locator("#app").innerText();
  check("no DribbleUp goal bar without dribbling data", !t.includes("DribbleUp minutes"));
  check("Weekly Goals heads like every other section", await p.evaluate(() => {
    const h = [...document.querySelectorAll(".section-label")].find(e => /Weekly Goals/i.test(e.textContent));
    return !!h && parseFloat(getComputedStyle(h).fontSize) >= 20;
  }));
  await ctx.close();
}
// --- Empty state -----------------------------------------------------------
{
  const { p, ctx, errs } = await open({ empty:true });
  const t = await p.locator("#app").innerText();
  check("empty state uses the hero shape", await p.locator(".hero-value").count() === 1);
  check("empty state explains what happens next", t.toLowerCase().includes("no sessions yet"));
  check("empty state sells the three features", t.includes("What you'll get") && t.includes("AI coach"));
  check("primary action present", t.toLowerCase().includes("log the first session"));
  check("empty state: no JS errors", errs.length===0, errs.slice(0,2));
  await p.screenshot({path: P(".build/new-empty.png"), clip:{x:0,y:0,width:430,height:900}});
  await ctx.close();
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
