import fs from "fs";
import { chromium } from "playwright";
const R = new URL("../", import.meta.url).pathname;
const b64 = (f) => fs.readFileSync(R + f).toString("base64");
const FACE = `@font-face{font-family:'BC';font-style:italic;font-weight:800;
  src:url(data:font/woff2;base64,${b64("fonts/barlow-condensed-italic-800-latin.woff2")}) format('woff2');}`;

// Three readings of the same mark, so the choice can be made on sight.
const CANDIDATES = {
  a: { bg: "#101010", fg: "#f47b20", label: "ink ground, orange IQ" },
  b: { bg: "#f47b20", fg: "#101010", label: "orange ground, ink IQ" },
  c: { bg: "#ffffff", fg: "#101010", accent: "#f47b20", label: "white ground, ink I-orange Q" },
};

// A maskable icon is cropped to a circle by the launcher, so the mark has to
// sit inside the inner 80% or it loses its edges.
function html({ bg, fg, accent }, size, maskable) {
  const scale = maskable ? 0.60 : 0.74;
  const glyph = accent
    ? `<span style="color:${fg}">I</span><span style="color:${accent}">Q</span>`
    : `<span style="color:${fg}">IQ</span>`;
  return `<style>${FACE}
    html,body{margin:0;padding:0}
    .icon{width:${size}px;height:${size}px;background:${bg};display:flex;
      align-items:center;justify-content:center;overflow:hidden}
    .g{font-family:'BC';font-style:italic;font-weight:800;font-size:${Math.round(size*scale)}px;
      line-height:1;letter-spacing:-0.02em;
      /* The italic leans right, so nudge left to sit optically centred. */
      transform:translateX(-${Math.round(size*0.03)}px)}
  </style><div class="icon"><div class="g">${glyph}</div></div>`;
}

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await (await b.newContext({ deviceScaleFactor: 1 })).newPage();
for (const [key, spec] of Object.entries(CANDIDATES)) {
  for (const [name, size, maskable] of [["512", 512, false], ["192", 192, false], ["maskable", 512, true]]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(html(spec, size, maskable));
    await page.waitForTimeout(250);
    await page.screenshot({ path: `icon-${key}-${name}.png` });
  }
  console.log(`candidate ${key}: ${spec.label}`);
}
// A sheet showing all three at real home-screen size on both wallpapers.
// setContent has no base URL, so relative paths never resolve; inline them.
const tiles = Object.entries(CANDIDATES).map(([k, s]) =>
  `<figure><img src="data:image/png;base64,${fs.readFileSync(`icon-${k}-192.png`).toString("base64")}" width="118" height="118"><figcaption>${k}</figcaption></figure>`).join("");
await page.setViewportSize({ width: 560, height: 360 });
await page.setContent(`<style>
  body{margin:0;font-family:system-ui;display:grid;grid-template-rows:1fr 1fr}
  .row{display:flex;align-items:center;justify-content:center;gap:40px}
  .light{background:#d8d8d8}.dark{background:#1c1c1e}
  figure{margin:0;text-align:center}
  img{border-radius:26px;display:block}
  figcaption{margin-top:8px;font-size:13px;font-weight:600}
  .light figcaption{color:#111}.dark figcaption{color:#fff}
</style><div class="row light">${tiles}</div><div class="row dark">${tiles}</div>`);
await page.waitForTimeout(400);
await page.screenshot({ path: "icon-sheet.png" });
console.log("sheet written");
await b.close();
