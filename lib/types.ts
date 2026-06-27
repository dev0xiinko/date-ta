// Core domain types for Date Architect. See date_architect_spec(2).md §3.

export type Price = "Free" | "$" | "$$" | "$$$";

export type Window = "day" | "night";

/** 0=Sun .. 6=Sat. null for a day = closed. Times are "HH:MM" 24h. */
export type WeeklyHours = {
  [day: number]: { open: string; close: string }[] | null;
};

export type Spot = {
  id: string;
  name: string;
  category: string;
  area: string; // "Lahug", "IT Park", "Mandaue"...
  city: string;
  price: Price;
  best_time: string; // "morning"|"afternoon"|"golden hour"|"evening"|"late night"
  vibe: string;
  tags: string[];
  move: string; // the insider angle
  rating: number | null;
  lat: number | null;
  lng: number | null;
  hours: WeeklyHours | null; // null = unknown; don't hard-filter, just warn
  source: "verified" | "social";
};

/** A spot that survived candidate filtering, carrying its computed score. */
export type Candidate = Spot & {
  score: number;
  distanceKm: number | null; // from the anchor; null for the anchor itself / unknown coords
  unverified: boolean; // hours unknown
};

/** One stop the LLM chose + sequenced. Hydrated back to a full Spot for display. */
export type PlannedStop = {
  spotId: string;
  order: number;
  time: string; // "3:00 PM"
  activity: string;
  why: string;
};

/** Raw shape the LLM returns (before hydration). */
export type PlanLLMResult = {
  title: string;
  summary: string;
  stops: {
    id: string;
    time: string;
    activity: string;
    why: string;
  }[];
};

/** Fully hydrated plan returned to the client. */
export type Plan = {
  title: string;
  summary: string;
  stops: (PlannedStop & { spot: Spot })[];
};

/** Compact spot projection sent to /api/plan (the LLM never sees coords/hours). */
export type PlanCandidate = Pick<
  Spot,
  "id" | "name" | "category" | "area" | "price" | "best_time" | "tags" | "move"
>;

/** "date" = romantic date arc; "general" = a casual outing / good spots. */
export type PlanMode = "date" | "general";

/** Body for POST /api/plan. Candidate selection happens client-side now. */
export type PlanApiRequest = {
  prompt: string;
  budget?: string;
  window: Window;
  mode: PlanMode;
  stopCount?: number; // requested number of stops, e.g. "suggest 2 spots"
  startTime?: string; // requested start time, e.g. "7pm"
  near?: string; // requested area, e.g. "it park"
  candidates: PlanCandidate[];
};

/** One planned/run date. Spec §3. */
export type Session = {
  id: string;
  createdAt: number;
  prompt: string;
  budget: string;
  window: string;
  personId: string | null;
  plan: PlannedStop[];
  status: "planned" | "ran" | "skipped";
};

/** Per-stop or overall-date feedback. Spec §3. */
export type Feedback = {
  id?: number; // Dexie auto-increment
  sessionId: string;
  spotId: string | null; // null = overall-date feedback
  went: boolean;
  rating: -1 | 0 | 1 | 2; // bombed / meh / good / great
  note: string;
  createdAt: number;
};

/** Lightweight companion profile. Spec §3. */
export type Person = {
  id: string;
  name: string;
  notes: string[];
};

// ── finisher (Flow B, §5) ────────────────────────────────────────────────────

export type FinisherRead = "great" | "good" | "unsure" | "not feeling it";
export type FinisherIntent = "second date" | "keep open" | "casual" | "just kind";

export type FinisherDraft = { label: string; text: string };

/** Body for POST /api/finisher. */
export type FinisherApiRequest = {
  stops: { name: string; move: string; vibe: string }[];
  read: FinisherRead;
  intent: FinisherIntent;
  anchor?: string; // a moment to ground the message on
  herNotes?: string;
};

/** Derived learned preferences. Recomputed from feedback. Spec §3, §6. */
export type Profile = {
  tagScores: Record<string, number>;
  catScores: Record<string, number>;
  areaScores: Record<string, number>;
  winners: string[]; // spotIds repeatedly rated good/great
  avoid: string[]; // spotIds rated bombed
  notes: string[];
};

export const EMPTY_PROFILE: Profile = {
  tagScores: {},
  catScores: {},
  areaScores: {},
  winners: [],
  avoid: [],
  notes: [],
};
