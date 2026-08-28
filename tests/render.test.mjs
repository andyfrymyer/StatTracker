import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import { chromium } from "playwright";

const sessions = [
  { id:"a", type:"shooting", date:"2026-08-16", time:"10:00", label:"Shootaround", attempts:250, makes:112, swishes:42,
    spinRate:8, releaseTime:0, shotArc:55, intensity:70, duration:45, shotForm:"Consistent",
    closeAttempts:105, closeMakes:51, closeSwishes:20, midAttempts:144, midMakes:60, midSwishes:22,
    longAttempts:1, longMakes:1, longSwishes:0, badges:[{name:"Sharpshooter",grade:"A-",zone:"close"}] },
  { id:"b", type:"shooting", date:"2026-08-19", time:"17:30", label:"Shootaround", attempts:180, makes:79, swishes:30,
    spinRate:14, releaseTime:5, shotArc:60, intensity:66, duration:35, shotForm:"Consistent",
    closeAttempts:70, closeMakes:36, closeSwishes:15, midAttempts:100, midMakes:41, midSwishes:15,
    longAttempts:10, longMakes:2, longSwishes:0, badges:null },
];
const NEW_NOTE = {
  summary:"She shot 44.4% across 430 attempts.",
  progress:"Last time the ask was long-range reps: she went from 1 attempt to 10.",
  focus:"Keep extending range.",
  plan:[{drill:"Elbow-to-elbow mid-range",target:"60 attempts, aim for 30+ makes",why:"Mid sits at 41.4%, below close."},
        {drill:"Free-throw-line extended threes",target:"40 attempts, log makes",why:"Only 11 long attempts on record."}],
  goals:{shots:550,dribbleMinutes:35,rationale:"Slight bump on both."},
  dataGaps:"Release time read 0% in the first session, which looks like a capture miss.",
  generatedAt:"2026-08-22T10:00:00.000Z", sessionCount:2,
};
const LEGACY_NOTE = {
  summary:"Old-style cached note.", focus:"Long range.",
  benchmarks:"There's no official percentile chart for DribbleUp metrics.",
  goals:{shots:500,dribbleMinutes:30,rationale:"Hold steady."},
  generatedAt:"2026-08-17T10:00:00.000Z", sessionCount:2,
};

let pass = 0, fail = 0;
const check = (n, c, x) => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n, x ?? "")); };

const browser = await chromium.launch({ executablePath: CHROMIUM });

// The CDN is unreachable in this sandbox; stub the one global the render path
// needs so a missing chart library can't masquerade as a regression.
async function load({ note, profile, seed = true }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
  await page.addInitScript(([s, n, p, doSeed]) => {
    window.Chart = class { constructor(){} destroy(){} update(){} };
    window.Chart.defaults = { font: {}, color: "", borderColor: "" };
    if (!doSeed) return;
    localStorage.setItem("ella-sessions-standalone", s);
    localStorage.setItem("ella-coach-note-standalone", n);
    localStorage.setItem("ella-profile-standalone", p);
    localStorage.setItem("ella-api-base-standalone", ""); // offline: no network calls
  }, [JSON.stringify(sessions), JSON.stringify(note), profile || "", seed]);
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  // innerText applies CSS text-transform, so compare case-insensitively.
  const text = async () => (await page.locator("#app").innerText()).toLowerCase();
  return { page, ctx, errors, text };
}

{
  const { ctx, errors, text } = await load({ note: NEW_NOTE, profile: "14U point guard, plays up an age group." });
  const b = await text();
  check("page loads with no JS errors", errors.length === 0, errors.slice(0,3));
  check("summary renders", b.includes("she shot 44.4% across 430 attempts."));
  check("progress section renders", b.includes("since last note") && b.includes("from 1 attempt to 10"));
  check("focus renders", b.includes("focus next:") && b.includes("keep extending range."));
  check("plan heading renders", b.includes("next practice"));
  check("plan drill 1 renders", b.includes("elbow-to-elbow mid-range") && b.includes("60 attempts, aim for 30+ makes"));
  check("plan drill 2 renders", b.includes("free-throw-line extended threes"));
  check("plan 'why' renders", b.includes("mid sits at 41.4%, below close."));
  check("dataGaps renders", b.includes("worth checking:") && b.includes("looks like a capture miss"));
  check("suggested goals still render", b.includes("550 shots") && b.includes("35 dribbleup min"));
  check("legacy benchmarks block absent", !b.includes("where this sits"));
  await ctx.close();
}
{
  const { ctx, errors, text } = await load({ note: LEGACY_NOTE, profile: "" });
  const b = await text();
  check("legacy note: no JS errors", errors.length === 0, errors.slice(0,3));
  check("legacy note: summary renders", b.includes("old-style cached note."));
  check("legacy note: benchmarks still shown", b.includes("where this sits") && b.includes("no official percentile chart"));
  check("legacy note: no empty 'Next practice'", !b.includes("next practice"));
  check("legacy note: no empty 'Since last note'", !b.includes("since last note"));
  check("legacy note: no empty 'Worth checking'", !b.includes("worth checking"));
  await ctx.close();
}
{
  const { page, ctx, errors, text } = await load({ note: NEW_NOTE, profile: "14U point guard, plays up an age group." });
  check("profile card renders on dashboard", (await text()).includes("player context"));
  const ta = page.locator("#f-profile");
  check("profile textarea exists", await ta.count() === 1);
  check("profile value loads from storage", (await ta.inputValue()).includes("plays up an age group"));
  await ta.fill("14U combo guard, 5'6\". Coach wants catch-and-shoot reps.");
  await page.waitForTimeout(300);
  check("profile persists to localStorage",
        (await page.evaluate(() => localStorage.getItem("ella-profile-standalone"))).includes("catch-and-shoot"));
  // addInitScript re-runs on every navigation, so a plain reload would re-seed
  // the original profile over the edit. Open a fresh page in the same context
  // (same origin, same localStorage) with no seeding, and read back what the
  // app itself stored.
  const page2 = await ctx.newPage();
  await page2.addInitScript(() => {
    window.Chart = class { constructor(){} destroy(){} update(){} };
    window.Chart.defaults = { font: {}, color: "", borderColor: "" };
  });
  await page2.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page2.waitForTimeout(700);
  check("profile survives reload", (await page2.locator("#f-profile").inputValue()).includes("catch-and-shoot"));
  check("profile flow: no JS errors", errors.length === 0, errors.slice(0,3));
  await ctx.close();
}
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
