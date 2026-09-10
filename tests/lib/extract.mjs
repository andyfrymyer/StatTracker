// The app is one HTML file, so the suites that test pure functions pull those
// functions out of it by brace-matching rather than duplicating them.
import fs from "fs";
import { P } from "./env.mjs";

const html = fs.readFileSync(P("../index.html"), "utf8");
const open = html.indexOf("<script>", html.indexOf("</style>")) + "<script>".length;
const js = html.slice(open, html.indexOf("</script>", open));

function block(header) {
  const start = js.indexOf(header);
  if (start === -1) throw new Error(`index.html no longer contains: ${header}`);
  // Lookup tables are as worth testing as the functions that read them, and
  // those are arrays, so match whichever bracket opens the declaration.
  const brace = js.indexOf("{", start), square = js.indexOf("[", start);
  const openCh = square !== -1 && square < brace ? "[" : "{";
  const closeCh = openCh === "[" ? "]" : "}";
  let depth = 0, i = js.indexOf(openCh, start);
  for (;; i++) {
    if (js[i] === openCh) depth++;
    else if (js[i] === closeCh) { depth--; if (!depth) break; }
  }
  return js.slice(start, i + 1) + ";";
}

const BUNDLES = {
  "extracted.js": [
    "function apiError(message, status) {",
    "async function apiFetch(path, options) {",
    "async function postCoachNote(payload) {",
    "function coachErrorText(e) {",
  ],
  "payload.js": [
    "function esc(", "function localDateStr(", "function todayStr()", "function addDays(", "function getMonday(", "function fmtShort(",
    "function fmtWeekLabel(", "function computeDayStreak(", "function longestDayStreak(",
    "function computeInsight(", "function getMonthKey(", "function fmtMonthLabel(",
    "function prevMonthKey(", "function computeDerived()", "function buildCoachPayload()",
  ],
  "dribble.js": [
    "const KNOWN_DRILLS =", "const MONTH_MAP =",
    "function flattenOcrText(", "function detectScreenshotType(",
    "function firstNum(", "function trimDribbleLeaderboard(", "function parseDribbleScreenshot(",
  ],
};

fs.mkdirSync(P(".build"), { recursive: true });
for (const [name, headers] of Object.entries(BUNDLES)) {
  fs.writeFileSync(P(".build/" + name), headers.map(block).join("\n\n"));
}
console.log("extracted", Object.keys(BUNDLES).join(" and "), "from index.html");
