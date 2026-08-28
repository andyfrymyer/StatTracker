import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import fs from "fs";
import { chromium } from "playwright";
const lines = fs.readFileSync(P("fixtures/sessions.csv"),"utf8").trim().split("\n").slice(1);
const n = v => (v === "" || v === undefined) ? null : Number(v);
const sessions = lines.map((l,i) => { const r = l.split(",");
  return { id:"s"+i, type:"shooting", date:r[0], time:r[1], label:r[3],
    attempts:n(r[4]), makes:n(r[5]), swishes:n(r[6]),
    closeAttempts:n(r[7]), closeMakes:n(r[8]), closeSwishes:n(r[9]),
    midAttempts:n(r[10]), midMakes:n(r[11]), midSwishes:n(r[12]),
    longAttempts:n(r[13]), longMakes:n(r[14]), longSwishes:n(r[15]),
    spinRate:n(r[16]), releaseTime:n(r[17]), shotArc:n(r[18]), intensity:n(r[19]),
    duration:n(r[20]), shotForm:r[21], shotType:r[22], badges:null };
});
let pass=0, fail=0;
const check=(n,c,x)=>{ c?(pass++,console.log("  ok  "+n)):(fail++,console.log("FAIL  "+n,x??"")); };
const browser = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await browser.newContext({ viewport:{width:430,height:1000}, deviceScaleFactor:2 });
const page = await ctx.newPage();
const errors=[];
page.on("pageerror", e=>errors.push(String(e)));
page.on("console", m=>{ if(m.type()==="error" && !/Failed to load resource/.test(m.text())) errors.push("console: "+m.text()); });
// Capture every Chart config so the new chart code actually executes here.
await page.addInitScript((s)=>{
  window.__charts = {};
  window.Chart = class { constructor(el, cfg){ window.__charts[el && el.id] = JSON.parse(JSON.stringify({type:cfg.type, labels:cfg.data.labels, datasets:cfg.data.datasets.map(d=>({label:d.label,data:d.data,borderColor:d.borderColor,backgroundColor:d.backgroundColor}))})); } destroy(){} update(){} };
  window.Chart.defaults = { font:{}, color:"", borderColor:"" };
  localStorage.setItem("ella-sessions-standalone", s);
  localStorage.setItem("ella-api-base-standalone","");
}, JSON.stringify(sessions));
// Chart.js is vendored now, so it would load for real and replace the stub
// that captures chart configs. Block it so the stub survives.
await page.route("**/chart.umd.min.js", r => r.abort());
await page.route("**/tesseract*.js", r => r.abort());
await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
const t = (await page.locator("#app").innerText()).toLowerCase();

check("no JS errors (charts really rendered)", errors.length===0, errors.slice(0,3));
check("two real back-to-back sessions are NOT flagged", !t.includes("check these match up"), "false positive on Aug 12");
check("app is named ShootingIQ", t.includes("shooting") && t.includes("iq") && !t.includes("ella"));
check("zone pills show percentages", t.includes("52.2%") && t.includes("37.7%"));
check("zone pills show the denominator", t.includes("215/412") && t.includes("199/528"));
check("hero leads with last session FG%", t.includes("50.5") && t.includes("last session fg%"));
check("hero keeps career + spread as context", t.includes("career 43.9%") && t.includes("34.1–50.5% across 4 sessions"));
check("hero secondary row present", t.includes("sessions") && t.includes("shots") && t.includes("streak"));
check("dead Dribble Pts tile hidden (no dribbling logged)", !t.includes("dribble pts"));
check("FG% by session chart present", t.includes("shooting % by session"));
check("spread line present", t.includes("34.1–50.5% across 4 sessions"));
check("zone-by-session chart present", t.includes("zone fg% by session"));
check("long range excluded with a reason", t.includes("long-range left out") && t.includes("2 attempts"));
check("shot type card present", t.includes("by shot type"));
check("shot type shows the gap", t.includes("47.5%") && t.includes("34.1%"));
check("weekly charts hidden at 3 weeks", !t.includes("shooting % by week"));
check("makes-by-zone-by-week hidden", !t.includes("makes by zone, by week"));
const canv = await page.evaluate(()=>Array.from(document.querySelectorAll("canvas")).map(c=>c.id));
check("session canvases exist", canv.includes("chartFgSession") && canv.includes("chartZoneSession"), canv);
const cfg = await page.evaluate(()=>window.__charts);
check("FG%-by-session config built", !!cfg.chartFgSession, Object.keys(cfg));
check("FG% chart is bars, not a line", cfg.chartFgSession.type === "bar", cfg.chartFgSession && cfg.chartFgSession.type);
check("FG% chart plots all 4 sessions", JSON.stringify(cfg.chartFgSession.datasets[0].data) === "[44.8,48,34.1,50.5]", cfg.chartFgSession.datasets[0].data);
check("FG% x-labels are per session incl. time", cfg.chartFgSession.labels.length===4 && /aug 12/i.test(cfg.chartFgSession.labels[0]), cfg.chartFgSession.labels);
check("zone-by-session config built", !!cfg.chartZoneSession);
check("zone chart drops long range", cfg.chartZoneSession.datasets.map(d=>d.label).join(",") === "Close,Mid", cfg.chartZoneSession.datasets.map(d=>d.label));
check("close series is the real per-session pct", JSON.stringify(cfg.chartZoneSession.datasets[0].data)==="[48.6,58.3,37.1,63.3]", cfg.chartZoneSession.datasets[0].data);
check("mid series is the real per-session pct", JSON.stringify(cfg.chartZoneSession.datasets[1].data)==="[41.7,35.5,33.1,41.4]", cfg.chartZoneSession.datasets[1].data);
check("zone colors are the light-mode validated pair", cfg.chartZoneSession.datasets[0].borderColor==="#2f6fb5" && cfg.chartZoneSession.datasets[1].borderColor==="#e06c0a",
      cfg.chartZoneSession.datasets.map(d=>d.borderColor));
check("no weekly charts drawn", !cfg.chartFg && !cfg.chartAttempts && !cfg.chartZones, Object.keys(cfg));
await page.screenshot({ path: P(".build/dash-top.png"), clip:{x:0,y:0,width:430,height:1000} });
await page.evaluate(()=>window.scrollTo(0,900)); await page.waitForTimeout(400);
await page.screenshot({ path: P(".build/dash-charts.png") });
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
