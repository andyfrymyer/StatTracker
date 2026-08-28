import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import fs from "fs";
import { chromium } from "playwright";
const chartJs = fs.readFileSync(P("../chart.umd.min.js"),"utf8");
const lines = fs.readFileSync(P("fixtures/sessions.csv"),"utf8").trim().split("\n").slice(1);
const n = v => (v === "" || v === undefined) ? null : Number(v);
const sessions = lines.map((l,i) => { const r = l.split(",");
  return { id:"s"+i, type:"shooting", date:r[0], time:r[1], label:r[3], attempts:n(r[4]), makes:n(r[5]), swishes:n(r[6]),
    closeAttempts:n(r[7]), closeMakes:n(r[8]), closeSwishes:n(r[9]), midAttempts:n(r[10]), midMakes:n(r[11]), midSwishes:n(r[12]),
    longAttempts:n(r[13]), longMakes:n(r[14]), longSwishes:n(r[15]), spinRate:n(r[16]), releaseTime:n(r[17]),
    shotArc:n(r[18]), intensity:n(r[19]), duration:n(r[20]), shotForm:r[21], shotType:r[22], badges:null };
});
const NOTE = { summary:"Summary line.", progress:"Progress line.", focus:"Focus line.",
  plan:[{drill:"Drill",target:"60 attempts",why:"Because."}], goals:{shots:550,dribbleMinutes:30,rationale:"Reason."},
  dataGaps:"Gap line.", generatedAt:"2026-08-28T10:00:00.000Z", sessionCount:4 };

const b = await chromium.launch({ executablePath: CHROMIUM });
const ctx = await b.newContext({ viewport:{width:430,height:1400}, deviceScaleFactor:2 });
const page = await ctx.newPage();
await page.route("**/chart.umd.min.js", r => r.fulfill({status:200,contentType:"application/javascript",body:chartJs}));
await page.route("**/tesseract*.js", r => r.fulfill({status:200,contentType:"application/javascript",body:"window.Tesseract={};"}));
await page.addInitScript(([s,nt])=>{ localStorage.setItem("ella-sessions-standalone",s); localStorage.setItem("ella-coach-note-standalone",nt);
  localStorage.setItem("ella-profile-standalone","14U point guard."); localStorage.setItem("ella-api-base-standalone",""); }, [JSON.stringify(sessions), JSON.stringify(NOTE)]);
await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1600);

const sweep = () => page.evaluate(() => {
  const px = c => { const [r,g,bl] = c.match(/[\d.]+/g).map(Number).slice(0,3);
    const f = v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(bl); };
  const alpha = c => { const m = c.match(/[\d.]+/g); return m && m.length > 3 ? Number(m[3]) : 1; };
  const bgOf = el => { let e = el; while (e) { const c = getComputedStyle(e).backgroundColor;
      if (c && alpha(c) > 0.1) return c; e = e.parentElement; } return "rgb(255,255,255)"; };
  const out = [];
  for (const el of document.querySelectorAll("#app *")) {
    const txt = Array.from(el.childNodes).filter(n2 => n2.nodeType === 3).map(n2 => n2.textContent.trim()).join(" ").trim();
    if (!txt) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.3) continue;
    // WCAG exempts logotypes from contrast requirements. The orange I in the
    // wordmark measures 2.73:1 on white and is exempt on that basis; it is
    // skipped here so it cannot mask a real failure elsewhere.
    if (el.closest(".h-brand")) continue;
    const L1 = px(cs.color), L2 = px(bgOf(el));
    const ratio = (Math.max(L1,L2) + 0.05) / (Math.min(L1,L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio < need) out.push({ text: txt.slice(0,52), ratio: Math.round(ratio*100)/100, need, size, color: cs.color, bg: bgOf(el) });
  }
  return out;
});

let fails = await sweep();
console.log(`dashboard: ${fails.length} low-contrast text nodes`);
for (const f of fails) console.log(`  ${f.ratio}:1 (needs ${f.need}) ${f.size}px  "${f.text}"  ${f.color} on ${f.bg}`);
await page.click("text=Log Session"); await page.waitForTimeout(600);
const f2 = await sweep();
console.log(`log form: ${f2.length} low-contrast text nodes`);
for (const f of f2) console.log(`  ${f.ratio}:1 (needs ${f.need}) ${f.size}px  "${f.text}"  ${f.color} on ${f.bg}`);
await b.close();
process.exit(fails.length + f2.length ? 1 : 0);
