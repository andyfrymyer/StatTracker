import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import fs from "fs";
const src = fs.readFileSync(P(".build/payload.js"), "utf8");

// Three sessions shaped like the screenshot: 250/112/42 with a barely-used long zone.
const sessions = [
  { id:"a", type:"shooting", date:"2026-08-16", time:"10:00", label:"Shootaround",
    attempts:250, makes:112, swishes:42, spinRate:8, releaseTime:0, shotArc:55, intensity:70,
    duration:45, shotForm:"Consistent", shotType:"80% relaxed",
    closeAttempts:105, closeMakes:51, closeSwishes:20,
    midAttempts:144, midMakes:60, midSwishes:22,
    longAttempts:1, longMakes:1, longSwishes:0,
    badges:[{name:"Sharpshooter",grade:"A-",zone:"close"}] },
  { id:"b", type:"shooting", date:"2026-08-19", time:"17:30", label:"Shootaround",
    attempts:180, makes:79, swishes:30, spinRate:14, releaseTime:5, shotArc:60, intensity:66,
    duration:35, shotForm:"Consistent", shotType:null,
    closeAttempts:70, closeMakes:36, closeSwishes:15,
    midAttempts:100, midMakes:41, midSwishes:15,
    longAttempts:10, longMakes:2, longSwishes:0, badges:null },
  { id:"c", type:"dribbling", date:"2026-08-20", time:"18:00", drillName:"Tight Handles",
    points:420, reps:300, duration:22 },
];

const state = {
  sessions,
  goals: { shots: 500, dribbleMinutes: 30 },
  profile: "14U point guard, 5'4\", plays up. Coach wants her creating off the dribble.",
  coachNote: { summary:"Old summary.", focus:"Get long-range reps.", sessionCount:1,
               generatedAt:"2026-08-17T12:00:00.000Z", benchmarks:"legacy field" },
};
const { buildCoachPayload } = new Function("state", src + "; return {buildCoachPayload};")(state);
const p = buildCoachPayload();

let pass = 0, fail = 0;
const check = (n, c, x) => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n, x ?? "")); };

// The whole point is that this survives JSON.stringify with nothing lost.
const wire = JSON.stringify(p);
check("payload serializes", typeof wire === "string" && wire.length > 0);
check("no Sets/Maps leak through (would become {})", !/"practicedDates"/.test(wire));
check("round-trips losslessly", JSON.stringify(JSON.parse(wire)).length === wire.length);
check("no undefined survives", !wire.includes("undefined"));

check("profile passed through", p.profile.startsWith("14U point guard"), p.profile);
check("goals passed through", p.goals.shots === 500);
check("raw sessions still sent", p.sessions.length === 3);
check("session ids stripped", p.sessions.every(s => !("id" in s)));

const a = p.analysis;
// 250+180 attempts, 112+79 makes -> 191/430 = 44.4%
check("totalAttempts", a.totalAttempts === 430, a.totalAttempts);
check("totalMakes", a.totalMakes === 191, a.totalMakes);
check("totalSwishes excludes dribbling", a.totalSwishes === 72, a.totalSwishes);
check("overallPct = makes/attempts", a.overallPct === 44.4, a.overallPct);
check("shooting session count", a.shootingSessionCount === 2, a.shootingSessionCount);
check("sessionCount counts all types", a.sessionCount === 3, a.sessionCount);

const zone = Object.fromEntries(a.zones.map(z => [z.zone, z]));
check("close zone pct", zone.close.attempts === 175 && zone.close.makes === 87 && zone.close.pct === 49.7, JSON.stringify(zone.close));
check("mid zone pct", zone.mid.attempts === 244 && zone.mid.makes === 101 && zone.mid.pct === 41.4, JSON.stringify(zone.mid));
check("long zone thin but present", zone.long.attempts === 11 && zone.long.makes === 3, JSON.stringify(zone.long));
check("swishPct reported separately", zone.close.swishPct === 20, zone.close.swishPct);

// mechanics carry latest vs prior average, which is the trend signal
const mech = Object.fromEntries(a.mechanics.map(m => [m.key, m]));
check("releaseTime latest vs prior", mech.releaseTime.latest === 5 && mech.releaseTime.priorAvg === 0, JSON.stringify(mech.releaseTime));
check("spinRate latest vs prior", mech.spinRate.latest === 14 && mech.spinRate.priorAvg === 8, JSON.stringify(mech.spinRate));
check("a 0 reading is kept, not dropped", mech.releaseTime.count === 2, mech.releaseTime.count);

check("shotForm counts", a.shotForm.counts.Consistent === 2 && a.shotForm.latest === "Consistent", JSON.stringify(a.shotForm));
check("badges carry grade", a.badges.length === 1 && a.badges[0].grade === "A-", JSON.stringify(a.badges));
check("weekly buckets built", a.weekly.length >= 1 && a.weekly.every(w => "shootingPct" in w));
check("weekly has no full session arrays", !a.weekly.some(w => Array.isArray(w.sessions)));
check("streaks present", typeof a.streaks.currentDays === "number" && typeof a.streaks.longestDays === "number");

check("previousNote focus carried", p.previousNote.focus === "Get long-range reps.", JSON.stringify(p.previousNote));
check("previousNote records its session count", p.previousNote.atSessionCount === 1);
check("previousNote does not resend legacy fields", !("benchmarks" in p.previousNote));

// no previous note -> null, not a half-filled object
const fresh = new Function("state", src + "; return {buildCoachPayload};")({ ...state, coachNote: null }).buildCoachPayload();
check("null previousNote when none cached", fresh.previousNote === null);
const noProfile = new Function("state", src + "; return {buildCoachPayload};")({ ...state, profile: "" }).buildCoachPayload();
check("empty profile becomes null", noProfile.profile === null);

console.log("\npayload size:", (wire.length/1024).toFixed(1), "KB (server limit 1MB)");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
