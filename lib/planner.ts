import { selectCandidates } from "@/lib/candidates";
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
}): Promise<Plan> {
  const prompt = input.prompt.trim();
  const [spots, profile] = await Promise.all([getAllSpots(), getGlobalProfile()]);

  const intent = parsePrompt(prompt);
  const window: Window = input.window || intent.window || "night";
  const day = new Date().getDay();

  const candidates = selectCandidates(spots, {
    intentTags: intent.tags,
    window,
    day,
    budget: input.budget || undefined,
    profile,
    limit: 12,
  });
  if (candidates.length < 2) {
    throw new Error(
      "Not enough open spots match that for this time. Try a different vibe or window.",
    );
  }

  const compact: PlanCandidate[] = candidates.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    area: c.area,
    price: c.price,
    best_time: c.best_time,
    tags: c.tags,
    move: c.move,
  }));

  const res = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      budget: input.budget || undefined,
      window,
      mode: input.mode ?? "date",
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
  return { title: data.title as string, summary: data.summary as string, stops };
}
