import type { Feedback, Profile, Spot } from "@/lib/types";

// Pure profile update from one feedback row (spec §6.2). Mutates + returns the
// passed profile — callers clone first if they need immutability.

const W = { tag: 1, cat: 0.6, area: 0.4 };

/** Keep the most-recent `n` unique notes (newest last). */
export function dedupeKeepRecent(notes: string[], n: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = notes.length - 1; i >= 0; i--) {
    const t = notes[i].trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.unshift(t);
    if (out.length >= n) break;
  }
  return out;
}

export function applyFeedback(
  profile: Profile,
  fb: Feedback,
  spot: Spot | undefined,
): Profile {
  if (!spot) return profile;
  const r = fb.rating; // -1..+2
  for (const t of spot.tags) {
    profile.tagScores[t] = (profile.tagScores[t] ?? 0) + r * W.tag;
  }
  profile.catScores[spot.category] = (profile.catScores[spot.category] ?? 0) + r * W.cat;
  profile.areaScores[spot.area] = (profile.areaScores[spot.area] ?? 0) + r * W.area;
  if (r >= 1 && !profile.winners.includes(spot.id)) profile.winners.push(spot.id);
  if (r <= -1 && !profile.avoid.includes(spot.id)) profile.avoid.push(spot.id);
  if (fb.note) profile.notes = dedupeKeepRecent([...profile.notes, fb.note], 12);
  return profile;
}
