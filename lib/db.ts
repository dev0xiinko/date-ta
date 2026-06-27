import Dexie, { type Table } from "dexie";
import type { Feedback, Person, Plan, Profile, Session, Spot } from "@/lib/types";
import { EMPTY_PROFILE } from "@/lib/types";
import { applyFeedback, dedupeKeepRecent } from "@/lib/feedback";
import { SPOTS } from "@/lib/data/spots";

// Local-first store (IndexedDB via Dexie). Browser-only — never import the
// query helpers from server code (route handlers). Spec §2, §3.

// Profile rows are keyed by id: "global" or a personId.
export type ProfileRow = Profile & { id: string };

class DateArchitectDB extends Dexie {
  spots!: Table<Spot, string>;
  profiles!: Table<ProfileRow, string>;
  sessions!: Table<Session, string>;
  feedback!: Table<Feedback, number>;
  people!: Table<Person, string>;

  constructor() {
    super("date-architect");
    this.version(1).stores({
      spots: "id, area, category, source",
      profiles: "id",
      sessions: "id, createdAt, personId, status",
      feedback: "++id, sessionId, spotId, createdAt",
      people: "id, name",
    });
  }
}

export const db = new DateArchitectDB();

let seedPromise: Promise<void> | null = null;

/** Upsert the seed spots (idempotent, refreshes on each load) + ensure the
 *  global profile row exists. Runs once per page load. */
export function ensureSeeded(): Promise<void> {
  seedPromise ??= (async () => {
    await db.spots.bulkPut(SPOTS); // upsert by id; user-added spots untouched
    if (!(await db.profiles.get("global"))) {
      await db.profiles.put({ id: "global", ...EMPTY_PROFILE });
    }
  })();
  return seedPromise;
}

export async function getAllSpots(): Promise<Spot[]> {
  await ensureSeeded();
  return db.spots.toArray();
}

export async function getGlobalProfile(): Promise<Profile> {
  await ensureSeeded();
  const row = await db.profiles.get("global");
  if (!row) return EMPTY_PROFILE;
  const { id: _id, ...profile } = row;
  return profile;
}

export type StopOutcome = {
  spotId: string;
  spot: Spot;
  went: boolean;
  rating: -1 | 0 | 1 | 2 | null; // null = not rated
};

export type NightLog = {
  prompt: string;
  budget: string;
  window: string;
  overallRating: -1 | 0 | 1 | 2;
  note: string;
  stops: StopOutcome[];
};

/**
 * Persist a run date: write the Session, the Feedback rows, and fold per-stop
 * ratings into the global learned profile — all in one transaction. Spec §6.
 */
export async function logNight(log: NightLog): Promise<void> {
  await ensureSeeded();
  const now = Date.now();
  const sessionId = crypto.randomUUID();

  const session: Session = {
    id: sessionId,
    createdAt: now,
    prompt: log.prompt,
    budget: log.budget,
    window: log.window,
    personId: null,
    plan: log.stops.map((s, i) => ({
      spotId: s.spotId,
      order: i + 1,
      time: "",
      activity: "",
      why: "",
    })),
    status: "ran",
  };

  const feedback: Feedback[] = [];
  for (const s of log.stops) {
    if (s.rating == null) continue;
    feedback.push({
      sessionId,
      spotId: s.spotId,
      went: s.went,
      rating: s.rating,
      note: "",
      createdAt: now,
    });
  }
  // overall-date row (spotId null)
  feedback.push({
    sessionId,
    spotId: null,
    went: true,
    rating: log.overallRating,
    note: log.note,
    createdAt: now,
  });

  await db.transaction("rw", db.sessions, db.feedback, db.profiles, async () => {
    await db.sessions.put(session);
    await db.feedback.bulkAdd(feedback);

    const row = await db.profiles.get("global");
    const { id: _id, ...current } = row ?? { id: "global", ...EMPTY_PROFILE };
    // deep-clone so applyFeedback's mutation doesn't touch the cached row
    const profile: Profile = structuredClone(current);
    const spotById = new Map(log.stops.map((s) => [s.spotId, s.spot]));
    for (const fb of feedback) {
      if (fb.spotId) applyFeedback(profile, fb, spotById.get(fb.spotId));
    }
    if (log.note) profile.notes = dedupeKeepRecent([...profile.notes, log.note], 12);

    await db.profiles.put({ id: "global", ...profile });
  });
}
