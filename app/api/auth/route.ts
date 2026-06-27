import { creditsRemaining, isValidCode } from "@/lib/auth";

// Validate an access code. Used by the gate screen before unlocking the app.
// Returns remaining credits (null = unlimited / admin).
export async function POST(request: Request) {
  let code: unknown;
  try {
    ({ code } = (await request.json()) as { code?: unknown });
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof code === "string" && isValidCode(code)) {
    return Response.json({ ok: true, credits: creditsRemaining(code) });
  }
  return Response.json({ error: "That code didn't work." }, { status: 401 });
}
