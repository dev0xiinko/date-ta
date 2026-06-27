import type {
  Candidate,
  Profile,
  Spot,
  WeeklyHours,
  Window,
} from "@/lib/types";
import { EMPTY_PROFILE } from "@/lib/types";

// Candidate selection done in code BEFORE the LLM. Spec §4.1.
// Narrow first (fit + hours + geo), then hand the top ~12 to the model.

const BEST_TIME_BY_WINDOW: Record<Window, string[]> = {
  night: ["evening", "golden hour", "late night"],
  day: ["morning", "afternoon", "golden hour"],
};

/** Representative clock time to check opening hours against, per window. */
const CHECK_TIME_BY_WINDOW: Record<Window, string> = {
  day: "15:00",
  night: "20:00",
};

const PRICE_RANK: Record<Spot["price"], number> = {
  Free: 0,
  $: 1,
  $$: 2,
  $$$: 3,
};

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const d = (x: number) => (x * Math.PI) / 180;
  const dLat = d(b.lat - a.lat);
  const dLng = d(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(d(a.lat)) * Math.cos(d(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

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

function learnedScore(spot: Spot, p: Profile): number {
  let s = 0;
  for (const t of spot.tags) s += p.tagScores[t] ?? 0;
  s += p.catScores[spot.category] ?? 0;
  s += p.areaScores[spot.area] ?? 0;
  return s;
}

export type SelectOptions = {
  intentTags: string[];
  window: Window;
  day: number; // 0=Sun..6=Sat
  budget?: Spot["price"];
  nearArea?: string; // bias + anchor the cluster on this area
  profile?: Profile;
  limit?: number; // top-N to return (default 12)
};

/**
 * Score (intent + learned profile) with soft window/budget preferences and a
 * hard hours gate → geo-cluster around the top anchor → return the top-N
 * candidates for the LLM to sequence.
 */
export function selectCandidates(
  spots: Spot[],
  opts: SelectOptions,
): Candidate[] {
  const { intentTags, window, day } = opts;
  const profile = opts.profile ?? EMPTY_PROFILE;
  const limit = opts.limit ?? 12;
  const checkTime = CHECK_TIME_BY_WINDOW[window];
  const allowedBestTimes = BEST_TIME_BY_WINDOW[window];

  const scored: Candidate[] = [];

  for (const spot of spots) {
    // avoid list effectively drops the spot
    if (profile.avoid.includes(spot.id)) continue;

    // Hours filter: drop only when we KNOW it's closed; unknown → keep + flag.
    // This is the real time gate — a spot open during the window is eligible.
    const open = isOpenAt(spot.hours, day, checkTime);
    if (open === false) continue;
    const unverified = open === null;

    const matchTags = intentTags.filter((t) => spot.tags.includes(t));
    let score = matchTags.length * 2 + learnedScore(spot, profile);
    if (profile.winners.includes(spot.id)) score += 3;

    // Window: a SOFT preference, not a hard filter. `best_time` says when a
    // spot is *best*, not the only time it's usable (e.g. a cat cafe open till
    // 10pm is a fine night stop). Deprioritize an off-window spot — but never
    // when the prompt explicitly asked for it (matchTags), so "cats tonight"
    // still surfaces the cat cafe.
    if (spot.best_time && !allowedBestTimes.includes(spot.best_time) && !matchTags.length) {
      score -= 3;
    }

    // Budget: soft penalty, never a hard drop (spec §4.1.3).
    if (opts.budget && PRICE_RANK[spot.price] > PRICE_RANK[opts.budget]) {
      score -= (PRICE_RANK[spot.price] - PRICE_RANK[opts.budget]) * 1.5;
    }

    // Location: boost spots in/near the requested area.
    if (opts.nearArea && spot.area.toLowerCase().includes(opts.nearArea)) score += 3;

    // small nudge by rating to break ties
    if (spot.rating) score += spot.rating * 0.1;

    scored.push({ ...spot, score, distanceKm: null, unverified });
  }

  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) return [];

  // Geo-cluster around an anchor. Default = top-scored; if a location was
  // requested, anchor on a spot there (prefer one with coords) so the route
  // centers on that area. Prefer candidates within ~4km OR sharing the anchor's
  // area — kills the north-to-south bounce (spec §4.1.4).
  let anchor = scored[0];
  if (opts.nearArea) {
    const near = opts.nearArea;
    anchor =
      scored.find((c) => c.lat != null && c.lng != null && c.area.toLowerCase().includes(near)) ??
      scored.find((c) => c.area.toLowerCase().includes(near)) ??
      anchor;
  }
  const RADIUS_KM = 4;

  const withGeo = scored.map((c) => {
    if (c.id === anchor.id) return { ...c, distanceKm: 0 };
    if (
      anchor.lat != null &&
      anchor.lng != null &&
      c.lat != null &&
      c.lng != null
    ) {
      const distanceKm = haversineKm(
        { lat: anchor.lat, lng: anchor.lng },
        { lat: c.lat, lng: c.lng },
      );
      return { ...c, distanceKm };
    }
    return { ...c, distanceKm: null };
  });

  const near = withGeo.filter(
    (c) =>
      c.id === anchor.id ||
      c.area === anchor.area ||
      (c.distanceKm != null && c.distanceKm <= RADIUS_KM),
  );

  // If clustering leaves too few to build a 3–4 stop date, fall back to the
  // full scored list (still geo-sorted) rather than starving the planner.
  const pool = near.length >= 4 ? near : withGeo;

  pool.sort((a, b) => {
    // anchor first, then by score, with distance as a gentle secondary sort
    if (a.id === anchor.id) return -1;
    if (b.id === anchor.id) return 1;
    return b.score - a.score;
  });

  return pool.slice(0, limit);
}
