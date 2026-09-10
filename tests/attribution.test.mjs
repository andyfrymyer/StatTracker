// The shooting stats and the dribbling classes come from two different apps.
// The app kept crediting DribbleUp — the dribbling one — for shooting figures,
// twice over, once in a commit that was meant to fix exactly that. The copy
// tells her dad which app to open to check a number, so getting it wrong sends
// him to an app that does not report it.
import { P } from "./lib/env.mjs";
import fs from "fs";
const html = fs.readFileSync(P("../index.html"), "utf8");
let pass = 0, fail = 0;
const check = (n, c, x) => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n, x ?? "")); };

// Anything DribbleUp is credited with must be a dribbling thing. These are the
// terms only the shooting app reports.
const SHOOTING_TERMS = /shootaround|shots by distance|shots-by-distance|spin rate|release time|shot arc|intensity|swish|shot form|shot type|attempts|makes|FG%/i;
const offenders = html.split("\n")
  .map((line, i) => [i + 1, line])
  .filter(([, line]) => /DribbleUp/.test(line) && SHOOTING_TERMS.test(line))
  .map(([n, line]) => `${n}: ${line.trim().slice(0, 90)}`);
check("no line credits DribbleUp with a shooting figure", offenders.length === 0, offenders);

// And the two places that name a screen to go and look at must name the right app.
check("the mechanics caveat points at the shooting app",
  /shootaround summary in your shooting app/.test(html));
check("the import hint does not call the shooting screens DribbleUp's",
  !/DribbleUp screens/.test(html));

// The dribbling side must still be named, or the goal reads as a mystery unit.
check("dribbling minutes are still attributed to DribbleUp", /DribbleUp minutes/.test(html));
check("the recap still labels the dribbling block", /Dribbling \(DribbleUp\)/.test(html));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
