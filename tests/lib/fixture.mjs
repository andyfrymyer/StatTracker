// The dashboard calendar only ever draws the current month, so a fixture
// pinned to fixed dates stops being visible the moment the month turns — the
// suites that click a marked day were failing on the calendar, not on the app.
// Sliding the whole set forward keeps the real spacing between her sessions
// (which the weekly splits and streaks depend on) and lands the most recent
// one on today, whatever today is.
export function shiftIntoThisMonth(sessions) {
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const fmt = (ms) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const latest = Math.max(...sessions.map((s) => parse(s.date)));
  const offset = today - latest;
  return sessions.map((s) => ({ ...s, date: fmt(parse(s.date) + offset) }));
}

// Which of those dates the calendar will actually mark, and how each is
// labelled — derived from the data rather than written down, so the
// expectations move with it.
export function thisMonthDates(sessions) {
  const now = new Date();
  const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-`;
  return [...new Set(sessions.map((s) => s.date))].filter((d) => d.startsWith(prefix)).sort();
}

export const shortLabel = (dateStr) =>
  new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
