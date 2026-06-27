// LLM access via OpenRouter (OpenAI-compatible). Server-side only — the key
// never reaches the browser. Provider-agnostic so the model can be swapped
// freely with the OPENROUTER_MODEL env var.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Any OpenRouter model slug. Override with OPENROUTER_MODEL. Default is a
// current Claude; set whatever you have access to.
export const PLAN_MODEL = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.6";

// Optional comma-separated fallback slugs. If the primary errors (downtime /
// rate limit), OpenRouter retries down the list and bills only the run that
// succeeds. e.g. OPENROUTER_FALLBACK_MODELS="openai/gpt-4o,google/gemini-2.0-flash-001"
const FALLBACK_MODELS = (process.env.OPENROUTER_FALLBACK_MODELS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export type ChatOptions = {
  system: string;
  user: string;
  maxTokens?: number;
  /** Ask for JSON-mode output where the model supports it. Defensive parsing
   *  on the caller side still required — not every model honors it. */
  json?: boolean;
};

/** One-shot chat completion. Returns the assistant message text. */
export async function chat(opts: ChatOptions): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");

  const body: Record<string, unknown> = {
    model: PLAN_MODEL,
    max_tokens: opts.maxTokens ?? 1500,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  };
  // OpenRouter fallback routing: ordered list, primary first.
  if (FALLBACK_MODELS.length) body.models = [PLAN_MODEL, ...FALLBACK_MODELS];
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // Optional OpenRouter ranking headers.
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
      "X-Title": "Date Architect",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter returned no content");
  }
  return content;
}
