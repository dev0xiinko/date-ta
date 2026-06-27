import { chat } from "@/lib/llm";
import { buildPlanUserMessage, PLAN_SYSTEM } from "@/lib/prompts";
import type { PlanApiRequest, PlanLLMResult } from "@/lib/types";

// Thin LLM proxy. Candidate selection happens client-side (Dexie + the learned
// profile); this route just sequences the shortlist and returns id-only stops.
// The OpenRouter key stays server-side. Spec §4.2, §7.

/** Strip ``` fences and slice first { … last } so JSON.parse never chokes. Spec §7. */
function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in response");
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function callPlanner(userMessage: string): Promise<PlanLLMResult> {
  const text = await chat({ system: PLAN_SYSTEM, user: userMessage, maxTokens: 1500, json: true });
  return extractJson(text) as PlanLLMResult;
}

export async function POST(request: Request) {
  let body: PlanApiRequest;
  try {
    body = (await request.json()) as PlanApiRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return Response.json({ error: "Describe the person or vibe first." }, { status: 400 });
  }

  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  if (candidates.length < 2) {
    return Response.json(
      { error: "Not enough candidates to plan a date." },
      { status: 422 },
    );
  }

  const candidateIds = new Set(candidates.map((c) => c.id));
  const userMessage = buildPlanUserMessage({
    prompt,
    budget: body.budget,
    window: body.window,
    mode: body.mode === "general" ? "general" : "date",
    candidates,
  });

  // Fail soft: if the model returns < 2 valid stops, re-ask once. Spec §7.
  let result: PlanLLMResult;
  let stops: PlanLLMResult["stops"];
  try {
    result = await callPlanner(userMessage);
    stops = result.stops.filter((s) => candidateIds.has(s.id));
    if (stops.length < 2) {
      result = await callPlanner(
        userMessage + "\n\nReturn 3 or 4 stops, each id taken EXACTLY from the candidates.",
      );
      stops = result.stops.filter((s) => candidateIds.has(s.id));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Planner failed.";
    const status = message.includes("OPENROUTER_API_KEY") ? 500 : 502;
    return Response.json(
      { error: status === 500 ? "Server is missing its OpenRouter API key." : "The planner had trouble. Try again." },
      { status },
    );
  }

  if (stops.length < 2) {
    return Response.json({ error: "Couldn't build a coherent route. Try rephrasing." }, { status: 422 });
  }

  return Response.json({ title: result.title, summary: result.summary, stops });
}
