import type { WeeklyHours } from "@/lib/types";

// Normalize the dataset's free-text `hours_text` into structured WeeklyHours
// (spec §3 prep task). Best-effort: clean patterns parse, anything fuzzy
// ("verify", "by appointment", "mall hrs", "varies"…) returns null so the
// candidate engine treats it as "unknown — don't hard-filter, just warn".

const DAY_IDX: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

// Substrings that mean "hours not reliably known" → bail to null.
const FUZZY = [
  "verify", "varies", "appointment", "open access", "mall hrs", "mall hours",
  "showroom", "timeslot", "reservation", "soft-open", "msg fb", "book via",
  "day-night", "daytime", "evenings", "evening (", "by ",
];

function clean(t: string): string {
  return t.replace(/\s+/g, "");
}

/** Parse a single clock token ("8am", "9:30am", "12", "10pm") to minutes-from-midnight. */
function parseTime(tok: string, fallbackMeridian?: "am" | "pm"): number | null {
  const m = clean(tok).match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = (m[3] as "am" | "pm" | undefined) ?? fallbackMeridian;
  if (mer === "am") {
    if (h === 12) h = 0;
  } else if (mer === "pm") {
    if (h !== 12) h += 12;
  } else {
    return null; // ambiguous — no meridian and no fallback
  }
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

const toHHMM = (mins: number) =>
  `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

/** Inclusive day range with week wrap, e.g. tue→sun = [2,3,4,5,6,0]. */
function dayRange(a: number, b: number): number[] {
  const out: number[] = [];
  let d = a;
  for (let i = 0; i < 7; i++) {
    out.push(d);
    if (d === b) break;
    d = (d + 1) % 7;
  }
  return out;
}

function parseDays(seg: string): number[] | null {
  if (/\b(daily|everyday|mon-sun)\b/.test(seg)) return [0, 1, 2, 3, 4, 5, 6];
  if (/\b(wknd|weekend|wkend)\b/.test(seg)) return [5, 6, 0]; // fri–sun
  const range = seg.match(/\b(sun|mon|tue|wed|thu|fri|sat)-(sun|mon|tue|wed|thu|fri|sat)\b/);
  if (range) return dayRange(DAY_IDX[range[1]], DAY_IDX[range[2]]);
  const singles = [...seg.matchAll(/\b(sun|mon|tue|wed|thu|fri|sat)\b/g)].map((m) => DAY_IDX[m[1]]);
  return singles.length ? [...new Set(singles)] : null;
}

function parseTimes(
  seg: string,
  defOpen: number | null,
  defClose: number | null,
): { open: number; close: number } | null {
  // "til 11pm" — inherit open from the first segment
  let m = seg.match(/til\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/);
  if (m && defOpen != null) {
    const close = parseTime(m[1], "pm");
    if (close != null) return { open: defOpen, close };
  }
  // "from 1pm" — inherit close from the first segment
  m = seg.match(/from\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/);
  if (m && defClose != null) {
    const open = parseTime(m[1], "pm");
    if (open != null) return { open, close: defClose };
  }
  // "8am-6pm" / "12-10pm" / "8am-2am"
  m = seg.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/);
  if (m) {
    const endMer = /pm/.test(m[2]) ? "pm" : /am/.test(m[2]) ? "am" : undefined;
    const startHasMer = /am|pm/.test(m[1]);
    const open = parseTime(m[1], startHasMer ? undefined : endMer);
    const close = parseTime(m[2]);
    if (open != null && close != null) return { open, close };
  }
  return null;
}

export function parseHoursText(raw: string): WeeklyHours | null {
  if (!raw) return null;
  let text = raw.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  if (FUZZY.some((f) => text.includes(f))) return null;

  // pull out "(closed Mon)" / "(closed Sun/Mon)" before stripping parentheticals
  let closedDays: number[] = [];
  const closed = text.match(/\(closed ([^)]+)\)/);
  if (closed) {
    closedDays = parseDays(closed[1]) ?? [];
    text = text.replace(/\(closed [^)]+\)/, " ");
  }
  text = text.replace(/\([^)]*\)/g, " ").trim();

  const hours: WeeklyHours = {};
  for (let d = 0; d < 7; d++) hours[d] = null;

  let defOpen: number | null = null;
  let defClose: number | null = null;
  let matched = false;

  for (const seg of text.split("/").map((s) => s.trim()).filter(Boolean)) {
    const days = parseDays(seg);
    const times = parseTimes(seg, defOpen, defClose);
    if (!days || !times) continue;
    matched = true;
    defOpen ??= times.open;
    defClose ??= times.close;
    for (const d of days) hours[d] = [{ open: toHHMM(times.open), close: toHHMM(times.close) }];
  }

  if (!matched) return null;
  for (const d of closedDays) hours[d] = null;
  return hours;
}
