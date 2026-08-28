// Shared locations and knobs, so each suite can be run on its own or through
// tests/run.mjs without caring where it was started from.
import { fileURLToPath } from "url";

export const P = (rel) => fileURLToPath(new URL("../" + rel, import.meta.url));
export const BASE = process.env.TEST_BASE_URL || "http://127.0.0.1:8899";
// Playwright finds its own browser once `npx playwright install chromium` has
// run; set CHROMIUM_PATH to point at one that is already on the machine.
export const CHROMIUM = process.env.CHROMIUM_PATH || undefined;
