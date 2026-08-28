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
  let depth = 0, i = js.indexOf("{", start);
  for (;; i++) {
    if (js[i] === "{") depth++;
    else if (js[i] === "}") { depth--; if (!depth) break; }
  }
  return js.slice(start, i + 1);
}

const BUNDLES = {
  "extracted.js": [
    "function apiError(message, status) {",
    "async function apiFetch(path, options) {",
    "async function postCoachNote(payload) {",
    "function coachErrorText(e) {",
  ],
  "payload.js": [
    "function todayStr()", "function addDays(", "function getMonday(", "function fmtShort(",
    "function fmtWeekLabel(", "function computeDayStreak(", "function longestDayStreak(",
    "function computeInsight(", "function getMonthKey(", "function fmtMonthLabel(",
    "function prevMonthKey(", "function computeDerived()", "function buildCoachPayload()",
  ],
};

fs.mkdirSync(P(".build"), { recursive: true });
for (const [name, headers] of Object.entries(BUNDLES)) {
  fs.writeFileSync(P(".build/" + name), headers.map(block).join("\n\n"));
}
console.log("extracted", Object.keys(BUNDLES).join(" and "), "from index.html");
