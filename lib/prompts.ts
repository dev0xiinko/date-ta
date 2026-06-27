// Versioned prompt templates, kept out of app logic so they can be iterated on
// freely. Spec §7. (The spec suggests /prompts/*.txt; co-locating as TS keeps
// them type-checked and importable without a file-read.)

export const PLAN_SYSTEM = `You are a Cebu route planner. You are given CANDIDATE spots already filtered for
fit, opening hours, and location. Choose 3 or 4 that form ONE coherent outing and order
them as a natural arc: lighter/coffee/craft earlier, food in the middle, views or bars
to close. Keep the geographic flow tight. Honor the budget/window loosely — don't force
a bad match. If a learned profile is provided, lean into liked tags and proven winners,
and steer clear of disliked ones. Reference each spot only by its exact id.

MODE: if "date", craft it as a romantic date arc and write to that intent. If "general",
it's a casual outing — friends, solo, or just exploring — so keep the same tight, coherent
flow but drop the romance framing and the dating language.

Return ONLY raw JSON, no markdown fences, in exactly this shape:
{
  "title": "<= 6 words",
  "summary": "<= 28 words, why this route fits",
  "stops": [
    { "id": "<candidate id>", "time": "3:00 PM",
      "activity": "<= 24 words: concretely what to do here, tuned to the prompt",
      "why": "<= 12 words" }
  ]
}
Every stop id MUST be one of the candidate ids given to you. Return 3 or 4 stops.`;

export type PlanUserPayload = {
  prompt: string;
  budget?: string;
  window: string;
  mode: string;
  profileLine?: string;
  candidates: {
    id: string;
    name: string;
    category: string;
    area: string;
    price: string;
    best_time: string;
    tags: string[];
    move: string;
  }[];
};

export function buildPlanUserMessage(p: PlanUserPayload): string {
  return [
    `Mode: ${p.mode}`,
    `Description: "${p.prompt}"`,
    `Budget: ${p.budget ?? "no constraint"}  Window: ${p.window}`,
    p.profileLine ? `Learned profile: ${p.profileLine}` : null,
    `CANDIDATES (json): ${JSON.stringify(p.candidates)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── finisher (Flow B, §5) ────────────────────────────────────────────────────

export const FINISHER_SYSTEM = `Write end-of-date text message drafts for the user to send the person they just went
out with. Voice: lowercase, casual, ellipsis-friendly, understated, NO emoji stacks
(one is the ceiling). Ground every draft in the ACTUAL stops/moments provided — name a
real thing from the date. Match the user's read of how it went and their intent. If the
intent is a second date, end with one easy, concrete suggestion. Keep each draft to
1–3 short lines. Be genuine, never manipulative — no pressure, no games.

Return ONLY raw JSON, no markdown fences, in exactly this shape:
{ "messages": [
  { "label": "warm + direct", "text": "..." },
  { "label": "playful",       "text": "..." },
  { "label": "low-key",       "text": "..." }
] }`;

export type FinisherUserPayload = {
  stops: { name: string; move: string; vibe: string }[];
  read: string;
  intent: string;
  anchor?: string;
  herNotes?: string;
};

export function buildFinisherUserMessage(p: FinisherUserPayload): string {
  return [
    `Stops we did (json): ${JSON.stringify(p.stops)}`,
    p.anchor ? `Anchor moment: ${p.anchor}` : null,
    `How it went: ${p.read}`,
    `Intent: ${p.intent}`,
    p.herNotes ? `Her notes: ${p.herNotes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
