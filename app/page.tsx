"use client";

import { useEffect, useState } from "react";
import Finisher from "@/app/Finisher";
import Gate from "@/app/Gate";
import { getAccessCode } from "@/lib/access";
import { requestPlan } from "@/lib/planner";
import type { Plan, PlanMode, Price, Spot, Window } from "@/lib/types";

const SUGGESTIONS = [
  "cats + board games, low pressure",
  "speakeasy night, a view",
  "matcha + a tiny gallery",
  "street-food crawl",
];

const BUDGETS: { label: string; value: Price | "" }[] = [
  { label: "any", value: "" },
  { label: "$", value: "$" },
  { label: "$$", value: "$$" },
  { label: "$$$", value: "$$$" },
];

const WINDOWS: { label: string; value: Window | "" }[] = [
  { label: "any", value: "" },
  { label: "day", value: "day" },
  { label: "night", value: "night" },
];

const MODES: { label: string; value: PlanMode }[] = [
  { label: "date", value: "date" },
  { label: "general", value: "general" },
];

const PLACEHOLDER: Record<PlanMode, string> = {
  date: "describe your or your partner's preference, or your preferred date",
  general: "describe your preference",
};

function planToText(plan: Plan): string {
  const lines = [plan.title, plan.summary, ""];
  for (const s of plan.stops) {
    lines.push(`${s.time} — ${s.spot.name} (${s.spot.area})`);
    lines.push(`  ${s.activity}`);
  }
  return lines.join("\n");
}

function mapsUrl(s: Spot): string {
  // Search by name so Maps opens the venue's actual listing (with its info
  // card), not a bare coordinate pin. Area + city disambiguate same-named spots.
  const query = encodeURIComponent([s.name, s.area, s.city].filter(Boolean).join(", "));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

// Static map thumbnail from lat/lng. Prefers a Mapbox static image (precise,
// styled, needs NEXT_PUBLIC_MAPBOX_TOKEN); falls back to a keyless OpenStreetMap
// tile with the pin placed at the spot's exact position within the tile.
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

function osmTile(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const xf = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return {
    url: `https://tile.openstreetmap.org/${z}/${Math.floor(xf)}/${Math.floor(yf)}.png`,
    fx: xf - Math.floor(xf),
    fy: yf - Math.floor(yf),
  };
}

function MapThumb({ spot }: { spot: Spot }) {
  const base = "h-[58px] w-[58px] flex-none overflow-hidden rounded-xl border border-line";
  if (spot.lat == null || spot.lng == null) {
    return (
      <div
        className={`${base} flex items-center justify-center`}
        style={{ background: "radial-gradient(120% 120% at 30% 20%,#2c2030,#120c14)" }}
      >
        <span className="text-[15px] text-faint">📍</span>
      </div>
    );
  }
  if (MAPBOX_TOKEN) {
    const url = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/pin-s+f0589b(${spot.lng},${spot.lat})/${spot.lng},${spot.lat},14/116x116@2x?access_token=${MAPBOX_TOKEN}`;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`map of ${spot.name}`}
        loading="lazy"
        className={`${base} object-cover`}
      />
    );
  }
  const { url, fx, fy } = osmTile(spot.lat, spot.lng, 15);
  return (
    <div className={`${base} relative`}>
      <div
        className="absolute inset-0"
        style={{ backgroundImage: `url("${url}")`, backgroundSize: "cover", filter: "saturate(.85) brightness(.9)" }}
      />
      <span
        className="absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0C0A0D]"
        style={{ left: `${fx * 100}%`, top: `${fy * 100}%`, background: "#F0589B", boxShadow: "0 0 6px rgba(240,88,155,.8)" }}
      />
    </div>
  );
}

function parseClock(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const mer = m[3]?.toLowerCase();
  if (mer === "pm" && h !== 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  return h * 60 + min;
}

function routeHours(plan: Plan): string | null {
  const ts = plan.stops
    .map((s) => parseClock(s.time))
    .filter((x): x is number => x != null);
  if (ts.length < 2) return null;
  const span = Math.round((((Math.max(...ts) - Math.min(...ts)) / 60 + 1.5) * 2)) / 2;
  return `~${span} hrs`;
}

// ── small bits ───────────────────────────────────────────────────────────────

// Space Mono meta label. Pass size/tracking/color in className (no defaults, so
// nothing to override — avoids Tailwind utility-conflict ambiguity).
function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`font-mono uppercase ${className}`}>{children}</div>;
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mt-2 flex gap-[3px] rounded-xl border border-line bg-card-2 p-1">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg py-2 text-center font-mono text-[11px] uppercase ${
            value === o.value ? "grad-pink-soft font-bold" : "text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StopRow({ stop, isLast }: { stop: Plan["stops"][number]; isLast: boolean }) {
  const s = stop.spot;
  const rating = s.rating ? `${s.rating}★` : null;
  return (
    <div className="flex items-stretch">
      <div className="relative w-[34px] flex-none">
        <div
          className="absolute left-4 top-0 bottom-0 w-0.5"
          style={{
            background: isLast
              ? "linear-gradient(180deg,#F49CC0,#F0589B)"
              : "linear-gradient(180deg,#F49CC0,#F08FB6)",
          }}
        />
        <div
          className="absolute rounded-full"
          style={
            isLast
              ? {
                  left: 6,
                  top: 22,
                  width: 22,
                  height: 22,
                  background: "#F0589B",
                  border: "3px solid #0C0A0D",
                  boxShadow: "0 0 0 1px #F0589B,0 0 16px rgba(240,88,155,.7)",
                }
              : {
                  left: 8,
                  top: 24,
                  width: 18,
                  height: 18,
                  background: "#F49CC0",
                  border: "3px solid #0C0A0D",
                  boxShadow: "0 0 0 1px #F49CC0,0 0 12px rgba(244,156,192,.55)",
                }
          }
        />
      </div>
      <div className="flex-1 pb-[22px]">
        <div
          className="rounded-2xl bg-card p-4"
          style={{ border: `1px solid ${isLast ? "#332A37" : "#27202B"}` }}
        >
          <div className="font-mono text-[10px] tracking-[1px] text-muted-2">
            stop {String(stop.order).padStart(2, "0")} · {stop.time.toLowerCase()} ·{" "}
            <span className={isLast ? "text-pink" : "text-rose"}>{s.category.toLowerCase()}</span>
          </div>
          <div className="mt-[7px] flex items-start gap-3">
            <MapThumb spot={s} />
            <div className="min-w-0">
              <div className="font-display text-[21px] font-medium leading-tight">{s.name}</div>
              <div className="mt-[3px] text-[12.5px] text-muted">
                {s.area}, {s.city} · {s.price}
                {rating && (
                  <>
                    {" · "}
                    <span className="text-rose">{rating}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[13.5px] leading-[1.5] text-soft">{stop.activity}</div>
          <div className="my-3 border-t border-dashed border-line-2" />
          <Eyebrow className="text-[9.5px] tracking-[2px] text-pink">the move</Eyebrow>
          <div className="mt-[5px] text-[13px] leading-[1.5] text-soft-2">{s.move}</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {s.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="rounded-md border border-line px-[7px] py-1 font-mono text-[9px] uppercase tracking-[1px] text-muted-2"
              >
                {t}
              </span>
            ))}
            {s.source === "social" && (
              <span className="rounded-md border border-pink-line px-[7px] py-1 font-mono text-[9px] uppercase tracking-[1px] text-rose">
                verify
              </span>
            )}
          </div>
          <a
            href={mapsUrl(s)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-[7px] rounded-[10px] border px-3 py-2 font-mono text-[10px] uppercase tracking-[1px]"
            style={{ borderColor: isLast ? "#4a2b3c" : "#332A37", color: isLast ? "#F0589B" : "#F49CC0" }}
          >
            <span
              className="inline-block h-[7px] w-[7px] rounded-full border-2"
              style={{ borderColor: isLast ? "#F0589B" : "#F49CC0" }}
            />
            open in maps ›
          </a>
        </div>
      </div>
    </div>
  );
}

function SkeletonRow({ delay, dim }: { delay: number; dim?: boolean }) {
  return (
    <div className="flex items-stretch" style={{ marginTop: delay ? 14 : 0 }}>
      <div className="relative w-[34px] flex-none">
        <div
          className="absolute left-4 top-6 bottom-0 w-0.5"
          style={{
            background: "linear-gradient(180deg,#F49CC0,#F08FB6)",
            animation: `glowpulse 1.4s ease-in-out ${delay}s infinite`,
          }}
        />
        <div
          className="absolute left-2 top-[18px] h-[18px] w-[18px] rounded-full"
          style={{
            background: dim ? "#48283E" : "#F49CC0",
            boxShadow: dim ? "none" : "0 0 12px rgba(244,156,192,.7)",
            animation: `glowpulse 1.2s ease-in-out ${delay}s infinite`,
          }}
        />
      </div>
      <div
        className="flex-1 rounded-2xl border border-line bg-card-2 p-[15px]"
        style={{ animation: `pulse 1.4s ease-in-out ${delay}s infinite` }}
      >
        <div className="h-[9px] w-1/2 rounded bg-[#2C2530]" />
        <div className="mt-[11px] h-4 w-2/3 rounded bg-[#3A2F3E]" />
        <div className="mt-[13px] h-2 w-5/6 rounded bg-[#241D27]" />
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<PlanMode>("date");
  const [budget, setBudget] = useState<Price | "">("");
  const [windowSel, setWindowSel] = useState<Window | "">("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Access gate: null = checking, false = locked, true = unlocked.
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [credits, setCredits] = useState<number | null>(null); // null = unlimited/unknown
  useEffect(() => {
    setUnlocked(!!getAccessCode());
  }, []);

  async function plan_it() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    setPlan(null);
    setFinishing(false);
    try {
      const { plan: p, credits: c } = await requestPlan({ prompt, budget, window: windowSel, mode });
      setPlan(p);
      setCredits(c);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setError(msg);
      if (/out of credits/i.test(msg)) setCredits(0);
    } finally {
      setLoading(false);
    }
  }

  async function copyPlan() {
    if (!plan) return;
    await navigator.clipboard.writeText(planToText(plan));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // ── access gate ──
  if (unlocked === null) return null; // still checking localStorage; avoid flash
  if (!unlocked)
    return (
      <Gate
        onUnlock={(c) => {
          setUnlocked(true);
          setCredits(c);
        }}
      />
    );

  // ── loading ──
  if (loading) {
    return (
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col px-[22px] pb-10 pt-[18px]">
        <div className="rounded-2xl border border-line bg-card-3 px-[14px] py-3">
          <Eyebrow className="text-[9px] tracking-[2px] text-meta">the vibe</Eyebrow>
          <div className="mt-1.5 text-[13px] leading-snug text-muted">{prompt}</div>
        </div>
        <div className="mt-[26px] text-center">
          <div className="font-mono text-[15px] tracking-[1px] text-rose">
            plotting the route{" "}
            <span style={{ animation: "glowpulse 1.1s ease-in-out infinite" }}>···</span>
          </div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[1.5px] text-meta">
            scanning cebu spots · matching the vibe
          </div>
        </div>
        <div className="mt-[26px]">
          <SkeletonRow delay={0} />
          <SkeletonRow delay={0.2} dim />
          <SkeletonRow delay={0.4} dim />
          <SkeletonRow delay={0.6} dim />
        </div>
      </main>
    );
  }

  // ── finisher ──
  if (plan && finishing) {
    return (
      <Finisher
        plan={plan}
        prompt={prompt}
        budget={budget}
        window={windowSel}
        onBack={() => setFinishing(false)}
        onSaved={() => {
          setFinishing(false);
          setPlan(null);
        }}
      />
    );
  }

  // ── route ──
  if (plan) {
    const hrs = routeHours(plan);
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line-3 bg-[rgba(12,10,13,.72)] px-[14px] py-[10px] backdrop-blur">
          <button
            onClick={() => setPlan(null)}
            className="flex items-center gap-1 px-2 py-[7px] font-mono text-[12px] text-muted"
          >
            <span className="-mt-px text-[19px] leading-none">‹</span> back
          </button>
          <Eyebrow className="text-[10px] tracking-[2px] text-meta">your route</Eyebrow>
          <button
            onClick={copyPlan}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-line text-[16px] text-muted"
            aria-label="copy plan"
          >
            ↗
          </button>
        </header>

        <div className="flex-1 px-5 pb-5 pt-3.5">
          <div className="rounded-[14px] border border-line bg-card-2 p-4" style={{ borderLeft: "3px solid #F49CC0" }}>
            <div className="font-mono text-[10px] uppercase tracking-[1.5px] text-rose">
              your route · {plan.stops.length} stops{hrs ? ` · ${hrs}` : ""}
            </div>
            <div className="mt-[9px] font-display text-[25px] font-medium italic leading-tight">
              {plan.title}
            </div>
            <div className="mt-2 text-[13px] leading-[1.5] text-muted">{plan.summary}</div>
          </div>

          <div className="mt-[18px]">
            {plan.stops.map((s, i) => (
              <StopRow key={s.spotId} stop={s} isLast={i === plan.stops.length - 1} />
            ))}
          </div>

          <button
            onClick={() => setFinishing(true)}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-[14px] border border-pink-line bg-[rgba(240,88,155,.06)] py-[14px] text-[13.5px] font-medium text-rose"
          >
            ran the date? log how it went <span className="text-[16px] leading-none">›</span>
          </button>
        </div>

        <footer className="sticky bottom-0 flex gap-[11px] border-t border-line-3 bg-ink-2 px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-3">
          <button
            onClick={plan_it}
            className="flex-1 rounded-[14px] border border-line-2 py-[15px] text-center text-[14px] font-medium text-cream"
          >
            ↺ re-roll
          </button>
          <button
            onClick={copyPlan}
            className="grad-pink flex-[1.5] rounded-[14px] py-[15px] text-center text-[14px] font-bold"
            style={{ boxShadow: "0 10px 26px rgba(240,88,155,.34)" }}
          >
            {copied ? "copied ✓" : "⎘ copy plan"}
          </button>
        </footer>
      </div>
    );
  }

  // ── composer ──
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col">
      <div className="flex-1 px-[22px] pb-4 pt-8">
        <Eyebrow className="text-[11px] tracking-[2.5px] text-muted-2">cebu · curated low-key spots</Eyebrow>
        <h1 className="mt-3 font-display text-[35px] font-medium leading-[1.1] tracking-[-0.6px]">
          describe her.
          <br />
          get the <span className="italic text-pink">route</span>.
        </h1>
        <p className="mt-[11px] text-[14px] leading-[1.5] text-muted">
          one vibe in, a plotted night out — three or four real spots, threaded into a route you can
          actually run.
        </p>

        <Eyebrow className="mt-5 text-[10px] tracking-[2px] text-meta">mode</Eyebrow>
        <Segmented options={MODES} value={mode} onChange={setMode} />

        <Eyebrow className="mt-[18px] text-[10px] tracking-[2px] text-meta">the vibe</Eyebrow>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") plan_it();
          }}
          rows={3}
          placeholder={PLACEHOLDER[mode]}
          className="vibe mt-[9px] min-h-[100px] w-full resize-none rounded-2xl bg-card-3 px-4 py-[15px] text-[14.5px] leading-[1.55] text-cream outline-none placeholder:text-placeholder"
        />

        <Eyebrow className="mt-[18px] text-[10px] tracking-[2px] text-meta">or start from one of these</Eyebrow>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setPrompt(s)}
              className="rounded-full border border-line-2 bg-card-2 px-[13px] py-[9px] text-[12.5px] leading-none text-muted"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-5 flex gap-3.5">
          <div className="flex-1">
            <Eyebrow className="text-[10px] tracking-[2px] text-meta">budget</Eyebrow>
            <Segmented options={BUDGETS} value={budget} onChange={setBudget} />
          </div>
          <div className="flex-1">
            <Eyebrow className="text-[10px] tracking-[2px] text-meta">window</Eyebrow>
            <Segmented options={WINDOWS} value={windowSel} onChange={setWindowSel} />
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-pink-line bg-[rgba(240,88,155,.08)] px-4 py-3 text-[13px] text-blush">
            {error}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-line-3 bg-ink-2 px-[22px] pb-[max(env(safe-area-inset-bottom),24px)] pt-3">
        <button
          onClick={plan_it}
          disabled={!prompt.trim()}
          className="grad-pink flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[16px] font-bold disabled:opacity-40"
          style={{ boxShadow: "0 12px 34px rgba(240,88,155,.4)" }}
        >
          plot the date <span className="text-[19px] leading-none">›</span>
        </button>
        <div className="mt-[11px] text-center font-mono text-[10px] uppercase tracking-[1.5px] text-faint">
          {credits === null
            ? "no logins · just the route"
            : `${credits} credit${credits === 1 ? "" : "s"} left`}
        </div>
      </div>
    </div>
  );
}
