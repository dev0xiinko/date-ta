// Access-code gate + per-code credits. Codes live in env (server-side only):
//   ACCESS_CODES  — comma-separated limited codes (CODE_CREDITS uses each)
//   ADMIN_CODES   — comma-separated unlimited codes
//   CODE_CREDITS  — credits per limited code (default 3)
// Fails closed: unset env → no valid codes.
//
// NOTE: usage is tracked in-memory per server process. That's durable for a
// long-running server (`next start` / a VPS) but NOT across serverless cold
// starts / instances (e.g. Vercel) — for hard durable credits, back `usage`
// with a KV store (Vercel KV / Upstash).

const usage = new Map<string, number>();

function parseList(v: string | undefined): string[] {
  return (v ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

const limitedCodes = () => parseList(process.env.ACCESS_CODES);
const adminCodes = () => parseList(process.env.ADMIN_CODES);

function creditLimit(): number {
  const n = parseInt(process.env.CODE_CREDITS ?? "3", 10);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

export function isValidCode(code: string | null | undefined): boolean {
  const c = code?.trim();
  if (!c) return false;
  return adminCodes().includes(c) || limitedCodes().includes(c);
}

export function isAdmin(code: string | null | undefined): boolean {
  const c = code?.trim();
  return !!c && adminCodes().includes(c);
}

/** Remaining credits for a code: null = unlimited (admin), number for limited. */
export function creditsRemaining(code: string | null | undefined): number | null {
  const c = code?.trim();
  if (!c || !isValidCode(c)) return 0;
  if (isAdmin(c)) return null;
  return Math.max(0, creditLimit() - (usage.get(c) ?? 0));
}

export function hasCredit(code: string | null | undefined): boolean {
  if (isAdmin(code)) return true;
  return (creditsRemaining(code) ?? 0) > 0;
}

/** Spend one credit (no-op for admin). Call only after a successful action. */
export function consumeCredit(code: string | null | undefined): void {
  const c = code?.trim();
  if (!c || isAdmin(c) || !isValidCode(c)) return;
  usage.set(c, (usage.get(c) ?? 0) + 1);
}
