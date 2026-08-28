import { P, BASE, CHROMIUM } from "./lib/env.mjs";
import fs from "fs";
const src = fs.readFileSync(P(".build/payload.js"),"utf8");
let pass=0, fail=0;
const check=(n,c,x)=>{ c?(pass++,console.log("  ok  "+n)):(fail++,console.log("FAIL  "+n,x??"")); };
const S = (o) => Object.assign({ id:Math.random().toString(36).slice(2), type:"shooting", date:"2026-08-12", time:"18:58",
  attempts:250, makes:112, swishes:42, closeAttempts:105, closeMakes:51, midAttempts:144, midMakes:60,
  longAttempts:1, longMakes:0, badges:null }, o);
const run = (sessions) => new Function("state", src + "; return {computeDerived};")({ sessions, goals:{shots:500,dribbleMinutes:30}, profile:"", coachNote:null }).computeDerived();

// The real case: two sessions logged back to back, same attempts, different makes.
let d = run([S({time:"18:58",makes:112,closeAttempts:105,midAttempts:144}), S({time:"18:59",makes:120,closeAttempts:139,midAttempts:110})]);
check("same attempts + different makes = two sessions, not flagged", d.duplicates.length===0, d.duplicates);

// A genuine double-log: the same screenshot entered twice, totals identical.
d = run([S({time:"18:58"}), S({time:"19:04"})]);
check("identical totals ARE flagged", d.duplicates.length===1, d.duplicates);
check("flag reports the totals", d.duplicates[0] && d.duplicates[0].makes===112 && d.duplicates[0].attempts===250);
check("identical zone splits are not called conflicting", d.duplicates[0] && d.duplicates[0].conflicting===false);

// Same totals, zone splits read differently: one screenshot parsed two ways.
d = run([S({time:"18:58",closeAttempts:105,midAttempts:144}), S({time:"19:04",closeAttempts:139,midAttempts:110})]);
check("same totals + different zones = conflicting", d.duplicates[0] && d.duplicates[0].conflicting===true);

// Different days never group.
d = run([S({date:"2026-08-12"}), S({date:"2026-08-13"})]);
check("different dates never group", d.duplicates.length===0, d.duplicates);

// Swishes differing is enough to separate them.
d = run([S({time:"18:58",swishes:42}), S({time:"19:04",swishes:48})]);
check("differing swishes separate them", d.duplicates.length===0, d.duplicates);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
