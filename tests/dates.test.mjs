import { P } from "./lib/env.mjs";
import fs from "fs";
// Dates are calendar days in the player's timezone. Run this file under a few
// real zones on both sides of Greenwich; UTC alone hides the whole bug class.
const src = fs.readFileSync(P(".build/payload.js"), "utf8");
const { todayStr, addDays, getMonday, localDateStr } =
  new Function("state", src + "; return {todayStr, addDays, getMonday, localDateStr};")({ sessions: [], goals: {} });

let pass = 0, fail = 0;
const check = (n, c, x) => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n, x ?? "")); };
const TZ = process.env.TZ || "UTC";

check(`[${TZ}] addDays is identity for 0`, addDays("2026-08-28", 0) === "2026-08-28", addDays("2026-08-28", 0));
check(`[${TZ}] addDays crosses forward`, addDays("2026-08-31", 1) === "2026-09-01", addDays("2026-08-31", 1));
check(`[${TZ}] addDays crosses backward`, addDays("2026-09-01", -1) === "2026-08-31", addDays("2026-09-01", -1));
check(`[${TZ}] getMonday of a Friday`, getMonday("2026-08-28") === "2026-08-24", getMonday("2026-08-28"));
check(`[${TZ}] getMonday of a Sunday looks back`, getMonday("2026-08-30") === "2026-08-24", getMonday("2026-08-30"));
check(`[${TZ}] getMonday of a Monday is itself`, getMonday("2026-08-24") === "2026-08-24", getMonday("2026-08-24"));
check(`[${TZ}] leap day survives`, addDays("2028-02-28", 1) === "2028-02-29", addDays("2028-02-28", 1));

// The original bug: an evening session in the Americas was dated tomorrow.
const evening = new Date("2026-08-28T20:30:00-04:00");
const asLocal = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(evening);
check(`[${TZ}] localDateStr matches the wall calendar`, localDateStr(evening) === asLocal, { got: localDateStr(evening), want: asLocal });
check(`[${TZ}] todayStr matches the wall calendar`,
  todayStr() === new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()), todayStr());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
