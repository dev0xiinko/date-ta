import type { Spot } from "@/lib/types";
import { parseHoursText } from "@/lib/hours";
import rawSpots from "@/seed/spots.json";

// Loads the seed dataset (seed/spots.json) and normalizes the free-text
// `hours_text` column into structured WeeklyHours (spec §3). To refresh the
// data, re-export cebu_date_spots.xlsx → Spots tab → seed/spots.json.

type RawSpot = Omit<Spot, "hours"> & { hours_text: string };

export const SPOTS: Spot[] = (rawSpots as unknown as RawSpot[]).map(
  ({ hours_text, ...rest }) => ({
    ...rest,
    hours: parseHoursText(hours_text),
  }),
);

export const SPOTS_BY_ID: Record<string, Spot> = Object.fromEntries(
  SPOTS.map((s) => [s.id, s]),
);
