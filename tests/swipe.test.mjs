import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import fs from "fs";
import { chromium } from "playwright";
const chartJs = fs.readFileSync(P("../chart.umd.min.js"),"utf8");
const fontCss = fs.readFileSync(P("vendor/fonts/fonts.local.css"),"utf8");
const lines = fs.readFileSync(P("fixtures/sessions.csv"),"utf8").trim().split("\n").slice(1);
const n = v => (v===""||v===undefined)?null:Number(v);
const sessions = lines.map((l,i)=>{const r=l.split(",");return {id:"s"+i,type:"shooting",date:r[0],time:r[1],label:r[3],attempts:n(r[4]),makes:n(r[5]),swishes:n(r[6]),closeAttempts:n(r[7]),closeMakes:n(r[8]),closeSwishes:n(r[9]),midAttempts:n(r[10]),midMakes:n(r[11]),midSwishes:n(r[12]),longAttempts:n(r[13]),longMakes:n(r[14]),longSwishes:n(r[15]),spinRate:n(r[16]),releaseTime:n(r[17]),shotArc:n(r[18]),intensity:n(r[19]),duration:n(r[20]),shotForm:r[21],shotType:r[22],badges:null};});
let pass=0, fail=0;
const check=(n2,c,x)=>{ c?(pass++,console.log("  ok  "+n2)):(fail++,console.log("FAIL  "+n2,x??"")); };

const b = await chromium.launch({executablePath: CHROMIUM});
// hasTouch so scroll-snap behaves as it does on a phone.
const ctx = await b.newContext({viewport:{width:430,height:1200},deviceScaleFactor:2,hasTouch:true,isMobile:true});
const p = await ctx.newPage();
const errors=[]; p.on("pageerror",e=>errors.push(String(e)));
await p.route("**/chart.umd.min.js", r=>r.fulfill({status:200,contentType:"application/javascript",body:chartJs}));
await p.route("**/tesseract*.js", r=>r.fulfill({status:200,contentType:"application/javascript",body:"window.Tesseract={};"}));
await p.route("**/fonts.googleapis.com/**", r=>r.fulfill({status:200,contentType:"text/css",body:fontCss}));
await p.route("**/__fonts/*.woff2", r=>{ const f=r.request().url().split("/").pop(); r.fulfill({status:200,contentType:"font/woff2",body:fs.readFileSync(P("vendor/fonts/"+f))}); });
await p.addInitScript(s=>{localStorage.setItem("ella-sessions-standalone",s);localStorage.setItem("ella-api-base-standalone","");}, JSON.stringify(sessions));
await p.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1500);

const slides = p.locator(".hero-slide");
const count = await slides.count();
console.log("slides built:", count);
const labels = await p.locator(".hero-label").allInnerTexts();
console.log("labels:", labels.join(" | "));
check("more than one slide", count > 1, count);
check("first slide is last-session FG%", labels[0] === "Last session FG%", labels[0]);
check("weakest zone slide present", labels.some(l=>/Mid-range FG%/i.test(l)), labels);
check("shot type slide present", labels.some(l=>/catch & shoot FG%/i.test(l)), labels);
check("weekly volume slide present", labels.some(l=>/Shots this week/i.test(l)), labels);
check("dots match slide count", await p.locator(".hero-dot").count() === count);

const at = async () => p.evaluate(()=>{ const t=document.getElementById("hero-track");
  return { i: Math.round(t.scrollLeft/t.clientWidth), left: t.scrollLeft, w: t.clientWidth }; });
check("starts on slide 0", (await at()).i === 0);

// A real flick, not a scrollTo.
// A real finger flick, dispatched through CDP — a mouse drag does not pan a
// scroll container, so only touch exercises the path a phone actually takes.
const box = await p.locator("#hero-track").boundingBox();
const y = box.y + box.height/2;
const cdp = await p.context().newCDPSession(p);
const touch = (type, x) => cdp.send("Input.dispatchTouchEvent", {
  type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
for (let s=0; s<2; s++) {
  let x = box.x + box.width - 40;
  await touch("touchStart", x);
  for (let k=1;k<=12;k++) { x -= 26; await touch("touchMove", x); }
  await touch("touchEnd", x);
  await p.waitForTimeout(800);
}
const after = await at();
check("swiping advances the carousel", after.i >= 1, after);
check("snapped cleanly to a slide edge", Math.abs(after.left - after.i*after.w) < 3, after);
const activeDot = await p.evaluate(()=>Array.from(document.querySelectorAll(".hero-dot")).findIndex(d=>d.classList.contains("active")));
check("active dot follows the swipe", activeDot === after.i, {activeDot, i: after.i});

// A tap on a dot jumps to that slide.
await p.locator(".hero-dot").last().click();
await p.waitForTimeout(700);
check("tapping a dot jumps to it", (await at()).i === count-1, await at());

// An unrelated re-render must not snap it back.
await p.evaluate(()=>window.render());
await p.waitForTimeout(500);
check("position survives a re-render", (await at()).i === count-1, await at());

check("no JS errors", errors.length===0, errors.slice(0,3));
await p.locator(".hero-dot").first().click(); await p.waitForTimeout(600);
await p.screenshot({path: P(".build/swipe-1.png"), clip:{x:0,y:0,width:430,height:400}});
await p.locator(".hero-dot").nth(1).click(); await p.waitForTimeout(700);
await p.screenshot({path: P(".build/swipe-2.png"), clip:{x:0,y:0,width:430,height:400}});
await b.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
