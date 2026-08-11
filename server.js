const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.set("trust proxy", true); // Railway sits behind a proxy; needed for accurate req.ip
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("railway")
    ? { rejectUnauthorized: false }
    : (process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }),
});

const APP_PIN = process.env.APP_PIN || ""; // optional: if set, required for writes via x-app-pin header

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS goals (
      id INT PRIMARY KEY DEFAULT 1,
      shots INT NOT NULL DEFAULT 500,
      dribble_minutes INT NOT NULL DEFAULT 30
    );
  `);
  await pool.query(`
    INSERT INTO goals (id, shots, dribble_minutes)
    VALUES (1, 500, 30)
    ON CONFLICT (id) DO NOTHING;
  `);
}

// Simple in-memory brute-force protection for the PIN check.
// Not distributed (fine for a single Railway instance) — resets on redeploy.
const pinAttempts = new Map(); // ip -> { failures, firstFailureAt, blockedUntil }
const MAX_FAILURES = 8;
const FAILURE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const BLOCK_MS = 15 * 60 * 1000; // 15 minute lockout after too many failures

function requirePin(req, res, next) {
  if (!APP_PIN) return next(); // no PIN configured = open writes (fine for a private link)

  const ip = req.ip || "unknown";
  const now = Date.now();
  let entry = pinAttempts.get(ip);

  if (entry && entry.blockedUntil && now < entry.blockedUntil) {
    const waitMin = Math.ceil((entry.blockedUntil - now) / 60000);
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${waitMin} min.` });
  }

  const header = req.get("x-app-pin") || "";
  if (header === APP_PIN) {
    pinAttempts.delete(ip); // reset on success
    return next();
  }

  if (!entry || now - entry.firstFailureAt > FAILURE_WINDOW_MS) {
    entry = { failures: 0, firstFailureAt: now, blockedUntil: null };
  }
  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES) {
    entry.blockedUntil = now + BLOCK_MS;
  }
  pinAttempts.set(ip, entry);
  return res.status(401).json({ error: "Invalid or missing PIN" });
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---- Sessions ----
app.get("/api/sessions", requirePin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT data FROM sessions ORDER BY (data->>'date') ASC");
    res.json(rows.map((r) => r.data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load sessions" });
  }
});

app.post("/api/sessions", requirePin, async (req, res) => {
  try {
    const session = req.body;
    if (!session || !session.id) return res.status(400).json({ error: "Session must include an id" });
    await pool.query(
      "INSERT INTO sessions (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2",
      [session.id, session]
    );
    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save session" });
  }
});

app.delete("/api/sessions/:id", requirePin, async (req, res) => {
  try {
    await pool.query("DELETE FROM sessions WHERE id = $1", [req.params.id]);
    res.json({ deleted: req.params.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

// Bulk replace — used for Import (overwrite) and Clear All (empty array)
app.put("/api/sessions", requirePin, async (req, res) => {
  const sessions = req.body;
  if (!Array.isArray(sessions)) return res.status(400).json({ error: "Expected an array of sessions" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM sessions");
    for (const s of sessions) {
      if (!s || !s.id) continue;
      await client.query("INSERT INTO sessions (id, data) VALUES ($1, $2)", [s.id, s]);
    }
    await client.query("COMMIT");
    res.json({ count: sessions.length });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to replace sessions" });
  } finally {
    client.release();
  }
});

// ---- Goals ----
app.get("/api/goals", requirePin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT shots, dribble_minutes FROM goals WHERE id = 1");
    const row = rows[0] || { shots: 500, dribble_minutes: 30 };
    res.json({ shots: row.shots, dribbleMinutes: row.dribble_minutes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load goals" });
  }
});

app.put("/api/goals", requirePin, async (req, res) => {
  try {
    const { shots, dribbleMinutes } = req.body || {};
    await pool.query(
      `INSERT INTO goals (id, shots, dribble_minutes) VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE SET shots = $1, dribble_minutes = $2`,
      [Number(shots) || 500, Number(dribbleMinutes) || 30]
    );
    res.json({ shots: Number(shots) || 500, dribbleMinutes: Number(dribbleMinutes) || 30 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save goals" });
  }
});

// ---- Vision-based screenshot parsing ----
// Tesseract flattens screenshots to text and loses x/y position, which makes
// the DribbleUp "Shots by distance" chart genuinely ambiguous to parse. A
// vision model reads the layout directly. Requires ANTHROPIC_API_KEY to be set
// on the server; if it isn't, the endpoint reports that and the app falls back
// to Tesseract.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const VISION_MODEL = process.env.VISION_MODEL || "claude-sonnet-5";

const VISION_PROMPT = `You are reading a screenshot from the DribbleUp basketball training app.

Return ONLY a JSON object, no prose, no markdown fences.

If this is a SHOOTAROUND summary screen, return:
{"type":"shooting","attempts":N,"makes":N,"swishes":N,"spinRate":N,"releaseTime":N,"shotArc":N,"intensity":N,"duration":N,"shotForm":"Consistent"|"Inconsistent","shotType":"NN% relaxed"}
(duration is the TIME ACTIVE or DURATION value in minutes; the percent metrics are the "% in range" numbers.)

If this is a "Shots by distance" popup with stacked bars, return:
{"type":"zones","close":{"attempts":N,"makes":N,"swishes":N},"mid":{...},"long":{...}}
Each bar has a total "N shots" caption above it and percentage labels inside it.
The bars are, left to right: Close-range, Mid-range, Long-range.
In each bar the LOWER percentage band is Swish and the band above it is Make.
Convert those percentages to counts using that bar's own shot total, rounding to
the nearest whole number. If a bar shows no percentage labels (too few shots),
omit its makes and swishes but still report its attempts.

If this screenshot shows a BADGES row (award icons, letter grades like "A+", or
achievement tiles, usually grouped under Close-range / Mid-range / Long-range
tabs), return:
{"type":"badges","badges":[{"name":"...","grade":"A+","zone":"close"|"mid"|"long"|null}]}
Use the visible label or grade on each badge. Omit any badge you cannot read.

If this is a session recap card (a drill name with points and reps), return:
{"type":"dribbling","drillName":"...","points":N,"reps":N,"date":"YYYY-MM-DD","time":"HH:MM"}

If it is none of these, return {"type":"unknown"}.
Use null for any value you cannot read confidently. Never guess a number that is not visible.`;

app.post("/api/vision-parse", requirePin, async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "Vision parsing not configured on the server (ANTHROPIC_API_KEY missing)" });
  }
  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 is required" });

  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType || "image/png", data: imageBase64 } },
            { type: "text", text: VISION_PROMPT },
          ],
        }],
      }),
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text().catch(() => "");
      console.error("Anthropic API error:", apiRes.status, detail.slice(0, 500));
      return res.status(502).json({ error: `Vision API error (${apiRes.status})` });
    }

    const data = await apiRes.json();
    const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Vision returned non-JSON:", cleaned.slice(0, 300));
      return res.status(502).json({ error: "Vision response wasn't valid JSON" });
    }
    res.json(parsed);
  } catch (err) {
    console.error("Vision parse failed:", err);
    res.status(500).json({ error: "Vision parse failed" });
  }
});

// ---- AI coaching analysis ----
const COACH_PROMPT = `You are an experienced youth basketball skills coach reviewing a
player's solo shooting workout data (captured by the DribbleUp app). The player is a
14U girls' guard working toward high school and eventual college play.

You will receive JSON with recent sessions. Fields: attempts, makes, swishes, per-zone
splits (close/mid/long, each with attempts/makes/swishes), spinRate/releaseTime/shotArc/
intensity (each a "% in range" figure where higher is better), duration in minutes,
shotForm, plus weekly goals.

IMPORTANT CONTEXT: in this app "makes" and "swishes" are counted SEPARATELY — a swish is
not included in the makes count. So shots that went in = makes + swishes.

Return ONLY a JSON object, no prose, no markdown fences:
{
  "summary": "2-4 sentences of specific observation about what the data shows. Reference
     actual numbers. Note trends across sessions if there are several. Be direct and
     concrete, like a coach talking to a parent — not generic encouragement.",
  "focus": "One specific thing to work on next, and briefly why the data points to it.",
  "goals": {"shots": N, "dribbleMinutes": N, "rationale": "One sentence on why these targets."},
  "benchmarks": "2-3 sentences on how these numbers compare to typical development for a
     14U guard. BE HONEST ABOUT UNCERTAINTY: there is no authoritative published dataset
     for DribbleUp metrics by age group, so speak in terms of general skill-development
     principles (shot volume, form consistency, range progression) rather than citing
     specific percentile figures. Do not invent statistics."
}

If there is very little data (one session or fewer), say so plainly rather than
over-interpreting. Never fabricate numbers that are not in the data. Keep the tone
supportive but honest — if something looks like a weakness, name it.`;

app.post("/api/coach-note", requirePin, async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "AI analysis not configured (ANTHROPIC_API_KEY missing)" });
  }
  const { sessions, goals } = req.body || {};
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return res.status(400).json({ error: "No sessions provided" });
  }
  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 1200,
        messages: [{
          role: "user",
          content: `${COACH_PROMPT}\n\nData:\n${JSON.stringify({ sessions: sessions.slice(-20), goals })}`,
        }],
      }),
    });
    if (!apiRes.ok) {
      const detail = await apiRes.text().catch(() => "");
      console.error("Coach note API error:", apiRes.status, detail.slice(0, 400));
      return res.status(502).json({ error: `AI error (${apiRes.status})` });
    }
    const data = await apiRes.json();
    const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      res.json(JSON.parse(cleaned));
    } catch (e) {
      console.error("Coach note non-JSON:", cleaned.slice(0, 300));
      res.status(502).json({ error: "AI response wasn't valid JSON" });
    }
  } catch (err) {
    console.error("Coach note failed:", err);
    res.status(500).json({ error: "AI analysis failed" });
  }
});

app.get("/api/vision-status", (req, res) => {
  res.json({ available: !!ANTHROPIC_API_KEY, model: ANTHROPIC_API_KEY ? VISION_MODEL : null });
});

const PORT = process.env.PORT || 3000;
init()
  .then(() => {
    app.listen(PORT, () => console.log(`Ella Tracker API listening on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
