// Schengen 90/180 day logic. Pure functions, no DOM, so it runs in the browser and under `node --test`.
// Rules (Reg. (EU) 2016/399 Art. 6; EC short-stay calculator): entry and exit days both count, and the
// window is the 180 days ending on the check date, inclusive. Overlapping trips never double count.

export const LIMIT = 90;
export const WINDOW = 180;

const DAY_MS = 86400000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse YYYY-MM-DD to a day number (days since 1970-01-01, UTC); null if malformed or not a real date. */
export function parseDate(text) {
  const m = ISO.exec(String(text).trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const dt = new Date(ms);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return ms / DAY_MS;
}

/** Day number to YYYY-MM-DD. */
export function formatDate(day) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Parse pasted text, one trip per line as `YYYY-MM-DD,YYYY-MM-DD`. Blank lines and a CSV header
 * (`entry,exit`) are skipped. Returns { trips: [[entryDay, exitDay]], errors: [{ line, message }] }.
 */
export function parseTripList(text) {
  const trips = [];
  const errors = [];
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || /^entry\s*,\s*exit$/i.test(line)) return;
    const parts = line.split(",");
    if (parts.length !== 2) {
      errors.push({ line: i + 1, message: "Expected two dates: YYYY-MM-DD,YYYY-MM-DD" });
      return;
    }
    const entry = parseDate(parts[0]);
    const exit = parseDate(parts[1]);
    if (entry === null || exit === null) {
      errors.push({ line: i + 1, message: "Not a valid date (use YYYY-MM-DD)" });
    } else if (exit < entry) {
      errors.push({ line: i + 1, message: "Exit is before entry" });
    } else {
      trips.push([entry, exit]);
    }
  });
  return { trips, errors };
}

/** Merge overlapping or touching trips into sorted, disjoint inclusive ranges, optionally clipped at `until`. */
export function mergeTrips(trips, until = Infinity) {
  const sorted = trips
    .map(([a, b]) => [a, Math.min(b, until)])
    .filter(([a, b]) => a <= b)
    .sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

// Days covered by disjoint ranges within [from, to] inclusive.
function covered(ranges, from, to) {
  let n = 0;
  for (const [a, b] of ranges) {
    const lo = Math.max(a, from);
    const hi = Math.min(b, to);
    if (hi >= lo) n += hi - lo + 1;
  }
  return n;
}

/** Days used in the 180-day window ending on `check` (inclusive). Trips after `check` are ignored. */
export function daysUsed(trips, check) {
  return covered(mergeTrips(trips, check), check - WINDOW + 1, check);
}

/**
 * Last day you can be present if you stay continuously from `check`, without exceeding 90 days in the
 * window ending on any day. Returns a day number, or null if `check` itself is already over the limit.
 */
export function lastSafeDay(trips, check) {
  const past = mergeTrips(trips, check - 1);
  let day = check;
  for (; day <= check + WINDOW + LIMIT; day++) {
    if (covered([...past, [check, day]], day - WINDOW + 1, day) > LIMIT) break;
  }
  return day === check ? null : day - 1;
}

/**
 * Future dates on which allowance returns, assuming no further days in Schengen after `check`.
 * Each event is { day, gained, remaining }: on `day` you regain `gained` days, leaving `remaining`.
 */
export function returns(trips, check) {
  const ranges = mergeTrips(trips, check);
  const events = [];
  let prev = covered(ranges, check - WINDOW + 1, check);
  for (let day = check + 1; day <= check + WINDOW && prev > 0; day++) {
    const used = covered(ranges, day - WINDOW + 1, day);
    if (used < prev) events.push({ day, gained: prev - used, remaining: Math.max(0, LIMIT - used) });
    prev = used;
  }
  return events;
}

/** Collapse consecutive-day events that each regain the same amount into runs, for a readable timeline. */
export function summariseReturns(events) {
  const runs = [];
  for (const e of events) {
    const last = runs[runs.length - 1];
    if (last && e.day === last.endDay + 1 && e.gained === last.gained) {
      last.endDay = e.day;
      last.remaining = e.remaining;
    } else {
      runs.push({ day: e.day, endDay: e.day, gained: e.gained, remaining: e.remaining });
    }
  }
  return runs;
}

/** Everything the page shows for one check date. */
export function summarise(trips, check) {
  const used = daysUsed(trips, check);
  return {
    used,
    left: Math.max(0, LIMIT - used),
    over: Math.max(0, used - LIMIT),
    lastSafe: lastSafeDay(trips, check),
    returns: returns(trips, check),
  };
}

/** CSV with header `entry,exit`, one trip per row, sorted by entry. Also accepted by parseTripList. */
export function toCsv(trips) {
  const rows = [...trips].sort((x, y) => x[0] - y[0]).map(([a, b]) => `${formatDate(a)},${formatDate(b)}`);
  return ["entry,exit", ...rows].join("\n") + "\n";
}
