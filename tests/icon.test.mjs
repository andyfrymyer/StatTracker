import { P } from "./lib/env.mjs";
import fs from "fs";
// The icon is the only part of the app that appears outside it, so the
// manifest, the HTML and the service worker all have to agree about it.
const manifest = JSON.parse(fs.readFileSync(P("../manifest.json"), "utf8"));
const html = fs.readFileSync(P("../index.html"), "utf8");
const sw = fs.readFileSync(P("../sw.js"), "utf8");

let pass = 0, fail = 0;
const check = (n, c, x) => { c ? (pass++, console.log("  ok  " + n)) : (fail++, console.log("FAIL  " + n, x ?? "")); };

// PNG dimensions live in the IHDR chunk at a fixed offset.
const dims = (f) => { const b = fs.readFileSync(P("../" + f));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length }; };

for (const icon of manifest.icons) {
  const [w, h] = icon.sizes.split("x").map(Number);
  const d = dims(icon.src);
  check(`${icon.src} exists at its declared ${icon.sizes}`, d.w === w && d.h === h, d);
  check(`${icon.src} is not a placeholder`, d.bytes > 1000, d.bytes);
}
check("a maskable icon is declared", manifest.icons.some(i => i.purpose === "maskable"));

// A dark splash in front of a white app is a visible flash on launch.
check("manifest background matches the app's ground", manifest.background_color === "#ffffff", manifest.background_color);
check("manifest theme matches the app's ground", manifest.theme_color === "#ffffff", manifest.theme_color);
const themeMeta = (html.match(/<meta name="theme-color" content="([^"]+)"/) || [])[1];
check("the page's theme-color agrees with the manifest", themeMeta === manifest.theme_color, { themeMeta, manifest: manifest.theme_color });
check("no navy left over from the old identity", !/#0d1b2e/i.test(JSON.stringify(manifest)));

const apple = (html.match(/rel="apple-touch-icon" href="([^"]+)"/) || [])[1];
check("apple-touch-icon points at a real file", !!apple && fs.existsSync(P("../" + apple)), apple);
check("and is not upscaled from the small one", dims(apple).w >= 512, apple && dims(apple).w);

for (const icon of manifest.icons) {
  check(`${icon.src} is cached by the service worker`, sw.includes(icon.src), icon.src);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
