import { getAccessCode } from "@/lib/access";
import { selectAvailable } from "@/lib/candidates";
import { getAllSpots, getGlobalProfile } from "@/lib/db";
import { parsePrompt } from "@/lib/intent";
import type { Plan, PlanCandidate, PlanMode, Price, Spot, Window } from "@/lib/types";

type LLMStop = { id: string; time: string; activity: string; why: string };

// Runs in the browser. Reads spots + the learned profile from Dexie, selects
// candidates locally, then posts the shortlist to /api/plan (LLM only).

export async function requestPlan(input: {
  prompt: string;
  budget?: Price | "";
  window?: Window | "";
  mode?: PlanMode;
}): Promise<{ plan: Plan; credits: number | null }> {
  const prompt = input.prompt.trim();
  const [spots, profile] = await Promise.all([getAllSpots(), getGlobalProfile()]);

  const intent = parsePrompt(prompt);
  const window: Window = input.window || intent.window || "night";
  const day = new Date().getDay();

  // Code only filters to what's OPEN during the window (+ drops profile avoids);
  // the LLM reads this set, parses the intent, and matches by reasoning.
  const candidates = selectAvailable(spots, {
    window,
    day,
    nearArea: intent.nearArea ?? undefined,
    profile,
    limit: 30,
  });
  if (candidates.length < 2) {
    throw new Error(
      "Not enough open spots for this time. Try a different window.",
    );
  }

  // Group by area so same-area spots sit together in the list — a free nudge
  // toward a geographically tight route.
  const compact: PlanCandidate[] = [...candidates]
    .sort((a, b) => a.area.localeCompare(b.area))
    .map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      area: c.area,
      price: c.price,
      best_time: c.best_time,
      tags: c.tags,
      move: c.move,
      vibe: c.vibe,
    }));

  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-access-code": getAccessCode() ?? "" },
    body: JSON.stringify({
      prompt,
      budget: input.budget || undefined,
      window,
      mode: input.mode ?? "date",
      stopCount: intent.stopCount ?? undefined,
      startTime: intent.startTime ?? undefined,
      near: intent.nearArea ?? undefined,
      candidates: compact,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");

  // Hydrate id-only stops back to full spots from the local candidate set.
  const byId = new Map<string, Spot>(candidates.map((c) => [c.id, c]));
  const stops: Plan["stops"] = (data.stops as LLMStop[])
    .filter((s) => byId.has(s.id))
    .map((s, i) => ({
      spotId: s.id,
      order: i + 1,
      time: s.time,
      activity: s.activity,
      why: s.why,
      spot: byId.get(s.id)!,
    }));

  if (stops.length < 2) throw new Error("Couldn't build a coherent route. Try rephrasing.");
  return {
    plan: { title: data.title as string, summary: data.summary as string, stops },
    credits: (data.credits ?? null) as number | null,
  };
}
