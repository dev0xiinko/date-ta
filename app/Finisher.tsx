"use client";

import { useState } from "react";
import { logNight } from "@/lib/db";
import { requestFinisher } from "@/lib/finisher";
import type {
  FinisherDraft,
  FinisherIntent,
  FinisherRead,
  Plan,
  Price,
  Window,
} from "@/lib/types";

const READS: FinisherRead[] = ["great", "good", "unsure", "not feeling it"];
const INTENTS: FinisherIntent[] = ["second date", "keep open", "casual", "just kind"];
const RATINGS: { label: string; value: -1 | 0 | 1 | 2 }[] = [
  { label: "bombed", value: -1 },
  { label: "meh", value: 0 },
  { label: "good", value: 1 },
  { label: "great", value: 2 },
];

const READ_TO_RATING: Record<FinisherRead, -1 | 0 | 1 | 2> = {
  great: 2,
  good: 1,
  unsure: 0,
  "not feeling it": -1,
};

const DRAFT_LABEL_COLOR = ["text-rose", "text-blush", "text-muted"];

function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`font-mono uppercase text-[10px] tracking-[2px] text-meta ${className}`}>
      {children}
    </div>
  );
}

export default function Finisher({
  plan,
  prompt,
  budget,
  window: windowSel,
  onBack,
  onSaved,
}: {
  plan: Plan;
  prompt: string;
  budget: Price | "";
  window: Window | "";
  onBack: () => void;
  onSaved: () => void;
}) {
  const [done, setDone] = useState<Record<string, boolean>>(
    Object.fromEntries(plan.stops.map((s) => [s.spotId, true])),
  );
  const [read, setRead] = useState<FinisherRead | null>(null);
  const [intent, setIntent] = useState<FinisherIntent | null>(null);
  const [ratings, setRatings] = useState<Record<string, -1 | 0 | 1 | 2>>({});
  const [note, setNote] = useState("");

  const [drafts, setDrafts] = useState<FinisherDraft[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const doneStops = plan.stops.filter((s) => done[s.spotId]);
  const canGenerate = !!read && !!intent && doneStops.length > 0 && !generating;

  async function generate() {
    if (!read || !intent || !doneStops.length) return;
    setGenerating(true);
    setGenError(null);
    try {
      const messages = await requestFinisher({
        stops: doneStops.map((s) => ({
          name: s.spot.name,
          move: s.spot.move,
          vibe: s.spot.vibe,
        })),
        read,
        intent,
        anchor: note.trim() || undefined,
      });
      setDrafts(messages);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Couldn't write the drafts.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyDraft(text: string, i: number) {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(i);
    setTimeout(() => setCopiedIdx((c) => (c === i ? null : c)), 1500);
  }

  async function save() {
    if (saving || !read) return;
    setSaving(true);
    try {
      await logNight({
        prompt,
        budget,
        window: windowSel,
        overallRating: READ_TO_RATING[read],
        note: note.trim(),
        stops: plan.stops.map((s) => ({
          spotId: s.spotId,
          spot: s.spot,
          went: !!done[s.spotId],
          rating: ratings[s.spotId] ?? null,
        })),
      });
      setSaved(true);
    } catch {
      setGenError("Couldn't save — try again.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line-3 bg-[rgba(12,10,13,.72)] px-[14px] py-[10px] backdrop-blur">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-2 py-[7px] font-mono text-[12px] text-muted"
        >
          <span className="-mt-px text-[19px] leading-none">‹</span> route
        </button>
        <Label className="text-meta">the finisher</Label>
        <div className="w-[38px]" />
      </header>

      <div className="flex-1 px-[22px] pb-5 pt-3.5">
        <h1 className="font-display text-[30px] font-medium leading-[1.1] tracking-[-0.4px]">
          how&apos;d it go?
        </h1>
        <p className="mt-[9px] text-[13.5px] leading-[1.5] text-muted">
          log it while it&apos;s fresh — then get a goodbye text that actually sounds like you.
        </p>

        {/* stops you did */}
        <Label className="mt-5">stops you did</Label>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {plan.stops.map((s) => {
            const on = done[s.spotId];
            return (
              <button
                key={s.spotId}
                onClick={() => setDone((d) => ({ ...d, [s.spotId]: !d[s.spotId] }))}
                className="rounded-full px-3 py-2 text-[12.5px]"
                style={
                  on
                    ? { background: "rgba(240,88,155,.16)", border: "1px solid #F0589B", color: "#F4EEF2" }
                    : { background: "#17141A", border: "1px solid #332A37", color: "#796D77" }
                }
              >
                {on ? "✓ " : ""}
                {s.spot.name}
              </button>
            );
          })}
        </div>

        {/* your read */}
        <Label className="mt-[18px]">your read</Label>
        <div className="mt-2.5 flex flex-wrap gap-[7px]">
          {READS.map((r) => (
            <button
              key={r}
              onClick={() => setRead(r)}
              className={`rounded-full px-3 py-2 text-[12px] ${
                read === r ? "grad-pink-soft font-semibold" : "border border-line-2 text-muted"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* intent */}
        <Label className="mt-[18px]">intent</Label>
        <div className="mt-2.5 flex flex-wrap gap-[7px]">
          {INTENTS.map((it) => (
            <button
              key={it}
              onClick={() => setIntent(it)}
              className="rounded-full px-3 py-2 text-[12px]"
              style={
                intent === it
                  ? { background: "rgba(244,156,192,.16)", border: "1px solid #F49CC0", color: "#F4EEF2", fontWeight: 600 }
                  : { border: "1px solid #332A37", color: "#AFA0AC" }
              }
            >
              {it}
            </button>
          ))}
        </div>

        {/* drafts */}
        <div className="mt-[26px] flex items-center justify-between">
          <Label>your drafts</Label>
          <button
            onClick={generate}
            disabled={!canGenerate}
            className="flex items-center gap-1.5 rounded-lg border border-pink-line px-[10px] py-1.5 font-mono text-[9.5px] uppercase tracking-[1px] text-rose disabled:opacity-40"
          >
            ↻ {drafts ? "rewrite" : "write"}
          </button>
        </div>

        {genError && <p className="mt-2 text-[12.5px] text-blush">{genError}</p>}

        {!drafts && !generating && (
          <p className="mt-2.5 text-[13px] leading-[1.5] text-faint">
            pick your read + intent, then write the goodbye text.
          </p>
        )}

        {generating && (
          <div className="mt-2.5 rounded-[14px] border border-line bg-card p-[14px]">
            <div
              className="font-mono text-[13px] tracking-[1px] text-rose"
              style={{ animation: "glowpulse 1.1s ease-in-out infinite" }}
            >
              writing in your voice ···
            </div>
          </div>
        )}

        {drafts?.map((d, i) => (
          <div key={i} className="mt-[11px] rounded-[14px] border border-line bg-card p-[14px]">
            <div className="flex items-center justify-between">
              <div
                className={`font-mono text-[9.5px] uppercase tracking-[1.5px] ${
                  DRAFT_LABEL_COLOR[i] ?? "text-muted"
                }`}
              >
                {d.label}
              </div>
              <button
                onClick={() => copyDraft(d.text, i)}
                className="rounded-[7px] border border-line-2 px-[11px] py-1.5 font-mono text-[9.5px] uppercase tracking-[1px] text-muted"
              >
                {copiedIdx === i ? "copied" : "copy"}
              </button>
            </div>
            <div className="mt-[9px] text-[14px] leading-[1.55] text-soft-2">{d.text}</div>
          </div>
        ))}

        {/* per-stop ratings */}
        <div className="mt-6 border-t border-line-3" />
        <Label className="mt-[22px]">how each stop went</Label>
        <div className="mt-1.5">
          {doneStops.map((s) => (
            <div
              key={s.spotId}
              className="flex items-center justify-between gap-2.5 border-b border-[#241D27] py-3"
            >
              <div className="w-24 flex-none font-display text-[15px] lowercase">{s.spot.name}</div>
              <div className="flex gap-[5px]">
                {RATINGS.map((rt) => {
                  const on = ratings[s.spotId] === rt.value;
                  return (
                    <button
                      key={rt.label}
                      onClick={() => setRatings((m) => ({ ...m, [s.spotId]: rt.value }))}
                      className="rounded-md px-[7px] py-1.5 font-mono text-[9px] uppercase"
                      style={
                        on
                          ? { background: "#F49CC0", border: "1px solid #F49CC0", color: "#2A0A16", fontWeight: 700 }
                          : { border: "1px solid #27202B", color: "#796D77" }
                      }
                    >
                      {rt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {doneStops.length === 0 && (
            <p className="py-3 text-[13px] text-faint">mark the stops you did to rate them.</p>
          )}
        </div>

        {/* note */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="add a note — what worked, what didn't…"
          className="vibe mt-3.5 w-full resize-none rounded-[13px] bg-card-3 px-[14px] py-[13px] text-[13.5px] leading-[1.5] text-cream outline-none placeholder:text-placeholder"
        />

        <div className="mt-3.5 flex items-center justify-center gap-[7px]">
          <span className="h-[5px] w-[5px] rounded-full bg-rose" />
          <span className="font-mono text-[10px] uppercase tracking-[1px] text-meta">
            this makes your next route smarter
          </span>
        </div>
      </div>

      <footer className="sticky bottom-0 border-t border-line-3 bg-ink-2 px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-3">
        {saved ? (
          <button
            onClick={onSaved}
            className="grad-pink flex w-full items-center justify-center gap-2 rounded-[15px] py-[15px] text-[15.5px] font-bold"
            style={{ boxShadow: "0 12px 30px rgba(240,88,155,.38)" }}
          >
            saved ✓ · plan another
          </button>
        ) : (
          <button
            onClick={save}
            disabled={saving || !read}
            className="grad-pink flex w-full items-center justify-center gap-2 rounded-[15px] py-[15px] text-[15.5px] font-bold disabled:opacity-40"
            style={{ boxShadow: "0 12px 30px rgba(240,88,155,.38)" }}
          >
            {saving ? "saving…" : "save the night"} <span className="text-[16px] leading-none">✓</span>
          </button>
        )}
      </footer>
    </div>
  );
}
