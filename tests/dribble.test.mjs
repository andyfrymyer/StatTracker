// DribbleUp's class recap replaced the older session card, and the parser only
// knew the old one. Both layouts are pinned here, plus the leaderboard that
// sits under the recap carrying other players' numbers.
import { P } from "./lib/env.mjs";
import fs from "fs";
const src = fs.readFileSync(P(".build/dribble.js"), "utf8");
const M = new Function(src + "; return {flattenOcrText,detectScreenshotType,parseDribbleScreenshot,trimDribbleLeaderboard};")();
let pass = 0, fail = 0;
const check = (n, c, x) => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n, x ?? "")); };

// Verbatim Tesseract output for the real screenshot — not a tidied-up version
// of it. The first fixture here was written by hand from what the screen looks
// like, and every pattern built on it passed while the app itself read the
// duration as a rep count. OCR mangles the icons to junk, clips "Total Points"
// to "Total Poin", drops the white-on-blue Retake button, and flattens the 2x2
// stat grid as both labels and then both values.
const RECAP = M.flattenOcrText(`Close
Wed, Sep 9, 2026 at 7:35PM
Circle Control
Oo Duration i} Total Reps
11:31 68
e\u2014 Drills lo) Class Rank
= 8 NY 57th
Points E
12 Mi 720
Sola 360
Total Poin 1080
Class Leaderboard See All
55th
fizaan 72 rei
y`);

check("recap is recognised as a dribbling screen", M.detectScreenshotType(RECAP) === "dribbling", M.detectScreenshotType(RECAP));

const r = M.parseDribbleScreenshot(RECAP);
check("class name is read by position", r.drillName === "Circle Control", r.drillName);
check("reps are the rep count, not the minutes off the clock", r.reps === "68", r.reps);
check("points survive OCR clipping the label to \"Total Poin\"", r.points === "1080", r.points);
check("duration 11:31 becomes 12 minutes", r.duration === "12", r.duration);
check("date is the local evening, not UTC tomorrow", r.date === "2026-09-09", r.date);
check("time is 24h", r.time === "19:35", r.time);

// The specific regression: the leaderboard must be gone before any number is read.
check("leaderboard is cut before parsing", !/fizaan/i.test(M.trimDribbleLeaderboard(RECAP)));
check("the header clock is never mistaken for the duration", r.duration !== "8" && r.time === "19:35");
// A cleaner OCR pass would read those rows properly, so the cut still matters.
const twoPlayers = M.parseDribbleScreenshot(RECAP + " 57th ella 68 reps 58th mia 64 reps");
check("more leaderboard rows still cannot leak in", twoPlayers.reps === "68", twoPlayers.reps);

// The older card layout has to keep working — sessions logged from it are already saved.
const CARD = M.flattenOcrText("Tight Handles Basketball Mon, Aug 3, 2026 at 6:12 PM 1080 pts 68 reps");
check("old inline card still detected", M.detectScreenshotType(CARD) === "dribbling");
const c = M.parseDribbleScreenshot(CARD);
check("old card points", c.points === "1080", c.points);
check("old card reps", c.reps === "68", c.reps);
check("old card drill name", c.drillName === "Tight Handles", c.drillName);
check("old card has no duration to read", c.duration === null, c.duration);

// A class we have never seen must not fall back to the first known drill.
const UNKNOWN = M.flattenOcrText("Thu, Sep 10, 2026 at 5:02 PM Figure Eight Flow Retake Class Duration 8:00 Total Reps 40 Total Points 500");
check("an unlisted class is still named", M.parseDribbleScreenshot(UNKNOWN).drillName === "Figure Eight Flow", M.parseDribbleScreenshot(UNKNOWN).drillName);
check("a round duration stays exact", M.parseDribbleScreenshot(UNKNOWN).duration === "8", M.parseDribbleScreenshot(UNKNOWN).duration);

// A shooting screen must never be claimed by the dribbling branch.
const SHOOT = M.flattenOcrText("Shootaround ATTEMPTS 250 MAKES 112 SWISHES 42 Retake Class Duration 20:00");
check("shooting still wins over the recap words", M.detectScreenshotType(SHOOT) === "shooting", M.detectScreenshotType(SHOOT));

// DribbleUp gives one screenshot per session, so that single screen has to
// carry every field a session stores. Read the stored fields out of the app
// rather than listing them here: if a new one is ever added, this fails until
// the parser can fill it or it is knowingly left manual.
const html = fs.readFileSync(P("../index.html"), "utf8");
const entry = html.slice(html.indexOf("const d = state.dribbling;"));
const stored = [...entry.slice(0, entry.indexOf("};")).matchAll(/^\s{6}(\w+):/gm)].map((m) => m[1]);
// id is generated; notes is free text she types; time and date live on the
// session rather than the drill, and the parser fills both.
const fromScreen = { ...r, time: r.time, date: r.date, type: "dribbling", id: "generated", notes: "manual" };
const missing = stored.filter((k) => fromScreen[k] === null || fromScreen[k] === undefined);
check("one screenshot fills every stored field", missing.length === 0, [missing, stored]);
check("and the two required ones are among them", r.points !== null && r.reps !== null);

// The same screen read cleanly — a better OCR pass, or a phone that renders the
// labels beside their values — must parse to exactly the same session.
const CLEAN = M.flattenOcrText("Wed, Sep 9, 2026 at 7:35 PM Circle Control Retake Class Duration 11:31 Total Reps 68 Drills 8 Class Rank 57th Points Earned 12 Minute Workout 720 Solar Flare 360 Total Points 1080 Class Leaderboard 55th fizaan 72 reps");
const cl = M.parseDribbleScreenshot(CLEAN);
check("a clean read gives the same reps", cl.reps === "68", cl.reps);
check("a clean read gives the same points", cl.points === "1080", cl.points);
check("a clean read gives the same duration", cl.duration === "12", cl.duration);
check("a clean read still ignores the leaderboard", cl.reps !== "72", cl.reps);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
