import type { Candidate, Profile, Spot, WeeklyHours, Window } from "@/lib/types";
import { EMPTY_PROFILE } from "@/lib/types";

// Code does ONLY the deterministic narrowing — which spots are OPEN during the
// window, and which the profile says to avoid. The LLM does the intent parsing,
// vibe matching, geographic coherence, and sequencing over what's left (it
// reasons better than keyword scoring). Light rating/profile rank exists only
// to choose which to keep when capping the set handed to the model.

/** Representative clock time to check opening hours against, per window. */
const CHECK_TIME_BY_WINDOW: Record<Window, string> = {
  day: "15:00",
  night: "20:00",
};

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Is the spot open at `time` on `day`? Returns null when hours are unknown
 * (so callers can "warn, don't drop"). Handles intervals that span midnight.
 */
export function isOpenAt(
  hours: WeeklyHours | null,
  day: number,
  time: string,
): boolean | null {
  if (!hours) return null;
  const intervals = hours[day];
  if (intervals === undefined) return null;
  if (intervals === null) return false; // explicitly closed that day
  const t = toMin(time);
  return intervals.some(({ open, close }) => {
    const o = toMin(open);
    let c = toMin(close);
    if (c <= o) c += 24 * 60; // overnight (e.g. 18:00–02:00)
    const tt = t < o ? t + 24 * 60 : t;
    return tt >= o && tt < c;
  });
}

export type AvailableOptions = {
  window: Window;
  day: number; // 0=Sun..6=Sat
  nearArea?: string; // a soft boost, not a hard filter — the LLM still decides
  profile?: Profile;
  limit?: number; // safety cap on how many spots to hand the model
};

/**
 * The spots open during the window (plus unknown-hours ones, flagged), minus
 * profile avoids. Ranked by rating + learned-profile fit + an optional
 * near-area boost — only so the cap keeps the strongest set. The LLM matches
 * the actual intent over this set.
 */
export function selectAvailable(spots: Spot[], opts: AvailableOptions): Candidate[] {
  const profile = opts.profile ?? EMPTY_PROFILE;
  const checkTime = CHECK_TIME_BY_WINDOW[opts.window];
  const near = opts.nearArea;

  const out: Candidate[] = [];
  for (const spot of spots) {
    if (profile.avoid.includes(spot.id)) continue;
    const open = isOpenAt(spot.hours, opts.day, checkTime);
    if (open === false) continue; // closed for this day/window — drop

    let score = spot.rating ?? 4.2; // null-rated spots get a neutral baseline
    for (const t of spot.tags) score += (profile.tagScores[t] ?? 0) * 0.2;
    if (profile.winners.includes(spot.id)) score += 2;
    if (near && spot.area.toLowerCase().includes(near)) score += 5;

    out.push({ ...spot, score, distanceKm: null, unverified: open === null });
  }

  out.sort((a, b) => b.score - a.score);
  return opts.limit ? out.slice(0, opts.limit) : out;
}
