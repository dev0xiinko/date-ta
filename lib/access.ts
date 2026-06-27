// Client-side store for the validated access code (browser localStorage). The
// code is sent as the x-access-code header on /api/* calls; the server is the
// real gate (lib/auth.ts).

const KEY = "da_access_code";

export function getAccessCode(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setAccessCode(code: string): void {
  window.localStorage.setItem(KEY, code);
}

export function clearAccessCode(): void {
  window.localStorage.removeItem(KEY);
}

/** Validate a code against the server; store it on success.
 *  credits: null = unlimited (admin), number = remaining for a limited code. */
export async function verifyAccessCode(
  code: string,
): Promise<{ ok: boolean; credits: number | null }> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return { ok: false, credits: 0 };
  const data = await res.json();
  setAccessCode(code);
  return { ok: true, credits: data.credits ?? null };
}
