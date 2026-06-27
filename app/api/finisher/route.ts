import { chat } from "@/lib/llm";
import { buildFinisherUserMessage, FINISHER_SYSTEM } from "@/lib/prompts";
import type { FinisherApiRequest, FinisherDraft } from "@/lib/types";

// End-of-date message generator (Flow B, §5). Thin LLM proxy — the key stays
// server-side. Returns 2–3 drafts in the user's voice.

function extractJson(raw: string): unknown {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON object in response");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function POST(request: Request) {
  let body: FinisherApiRequest;
  try {
    body = (await request.json()) as FinisherApiRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const stops = Array.isArray(body.stops) ? body.stops : [];
  if (!stops.length || !body.read || !body.intent) {
    return Response.json(
      { error: "Need the stops, your read, and your intent first." },
      { status: 400 },
    );
  }

  const userMessage = buildFinisherUserMessage({
    stops,
    read: body.read,
    intent: body.intent,
    anchor: body.anchor,
    herNotes: body.herNotes,
  });

  try {
    const text = await chat({
      system: FINISHER_SYSTEM,
      user: userMessage,
      maxTokens: 700,
      json: true,
    });
    const parsed = extractJson(text) as { messages?: FinisherDraft[] };
    const messages = (parsed.messages ?? []).filter(
      (m) => m && typeof m.text === "string" && m.text.trim(),
    );
    if (messages.length < 1) {
      return Response.json({ error: "Couldn't draft a message. Try again." }, { status: 422 });
    }
    return Response.json({ messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Finisher failed.";
    const status = message.includes("OPENROUTER_API_KEY") ? 500 : 502;
    return Response.json(
      {
        error:
          status === 500
            ? "Server is missing its OpenRouter API key."
            : "The writer had trouble. Try again.",
      },
      { status },
    );
  }
}
