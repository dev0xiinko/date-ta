"use client";

import { useState } from "react";
import { verifyAccessCode } from "@/lib/access";

export default function Gate({ onUnlock }: { onUnlock: (credits: number | null) => void }) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const c = code.trim();
    if (!c || checking) return;
    setChecking(true);
    setError(null);
    try {
      const { ok, credits } = await verifyAccessCode(c);
      if (ok) onUnlock(credits);
      else setError("that code didn't work.");
    } catch {
      setError("couldn't check that — try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col items-center justify-center px-[22px] text-center">
      <div
        className="flex h-[60px] w-[60px] items-center justify-center rounded-[15px]"
        style={{
          background: "radial-gradient(120% 120% at 30% 20%,#F87BB0,#F0589B 60%,#D63F82)",
          boxShadow: "0 10px 30px rgba(240,88,155,.4)",
        }}
      >
        <span className="font-display text-[24px] font-semibold italic text-on-pink">bs</span>
      </div>

      <h1 className="mt-6 font-display text-[30px] font-medium leading-[1.1] tracking-[-0.4px]">
        Bai <span className="italic text-pink">Spots</span>
      </h1>
      <p className="mt-2 text-[14px] leading-[1.5] text-muted">
        invite-only for now. drop your access code to get in.
      </p>

      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        inputMode="numeric"
        autoFocus
        placeholder="access code"
        className="vibe mt-7 w-full rounded-2xl bg-card-3 px-4 py-[15px] text-center font-mono text-[18px] tracking-[6px] text-cream outline-none placeholder:tracking-normal placeholder:text-placeholder"
      />

      {error && <p className="mt-3 text-[13px] text-blush">{error}</p>}

      <button
        onClick={submit}
        disabled={checking || !code.trim()}
        className="grad-pink mt-4 w-full rounded-2xl py-4 text-[16px] font-bold disabled:opacity-40"
        style={{ boxShadow: "0 12px 34px rgba(240,88,155,.4)" }}
      >
        {checking ? "checking…" : "unlock"}
      </button>

      <div className="mt-5 font-mono text-[10px] uppercase tracking-[1.5px] text-faint">
        curated cebu low-key spots
      </div>
    </main>
  );
}
