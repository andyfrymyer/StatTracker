# Tests

```sh
npm install
npx playwright install chromium   # once
npm test
```

`npm test` serves the app on `127.0.0.1:8899`, extracts the pure functions from
`index.html`, then runs every suite. Set `CHROMIUM_PATH` to reuse a browser that
is already installed, or `TEST_BASE_URL` to serve from somewhere else.

| Suite | Covers |
|---|---|
| `test.mjs` | `apiFetch` error handling — status codes, `{"error":…}` unwrapping, the 502 retry |
| `hang.mjs` | A hanging request is really aborted, with status 408 |
| `payload.test.mjs` | `buildCoachPayload` — zone maths, mechanics latest-vs-prior, JSON-safety |
| `dupe.test.mjs` | Duplicate detection, including two back-to-back sessions that must **not** be flagged |
| `dates.test.mjs` | Calendar-day maths, run under six timezones on both sides of Greenwich |
| `escape.test.mjs` | Nothing from storage, the API or the model reaches the DOM as markup |
| `render.test.mjs` | The coach's note card, new and legacy shapes |
| `real.render.mjs` | The dashboard against `fixtures/sessions.csv`, including captured chart configs |
| `swipe.test.mjs` | The hero carousel, driven with real touch events through CDP |
| `improve.test.mjs` | Offline rendering, pace tracking, zone swap, session notes, synced prefs |
| `contrast.mjs` | Every rendered text node against its effective background, at WCAG AA |

## Notes

`fixtures/sessions.csv` is a real four-session export, so the assertions carry
real numbers rather than invented ones.

`vendor/fonts/` holds the Barlow Condensed and Inter woff2 files. Google Fonts is
often unreachable from a test environment, and without the real faces a visual
check is looking at a fallback rather than at the app.

Two suites deliberately block `chart.umd.min.js` so their stub `Chart` survives
and can capture what the app asked to draw. `improve.test.mjs` blocks it for a
different reason — to prove the app still renders when the library is missing.

`dates.test.mjs` runs once per timezone, because UTC alone hides the entire
class of bug it exists to catch — `toISOString()` looks correct there and is
wrong everywhere else.

The API's own tests live in the `ella-tracker-api` repo.
