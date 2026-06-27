# Date Architect — build spec

A personal AI date planner for Cebu. Describe a person or a concept → get a plotted, hours-aware, distance-clustered itinerary with activities → run the date → write a genuine end-of-day "finisher" message → log how it went → the system gets smarter for next time.

This doc is written to be dropped into Claude Code as the project brief. Rename to `CLAUDE.md` or reference it from one.

---

## 1. The loop

```
prompt  ─►  parse + match  ─►  candidate filter (geo + hours + learned score)
                                        │
                                        ▼
                              LLM sequences 3–4 stops + activities
                                        │
                                        ▼
                                  run the date
                                        │
                                        ▼
              FINISHER screen ──►  message drafts (your voice)
                     │                  │
                     └──►  log feedback (per stop + overall + per person)
                                        │
                                        ▼
                        update learned profile  ──┐
                                                   │  (feeds back into "candidate filter")
                                                   └──────────────────────────────────────►
```

The whole thing is one feedback cycle. The finisher and the feedback capture are the **same screen** — you log the date while you're writing the goodbye text.

---

## 2. Stack

Aligned to what you already run (CashflowOS):

- **Next.js 15** (App Router) · **React 19** · **Tailwind v4** · **shadcn/ui**
- **Anthropic SDK**, called from **server route handlers** (`/api/plan`, `/api/finisher`) — keep the key server-side. The artifact called the API from the browser; don't do that in the real build.
- **Dexie.js / IndexedDB** for local-first persistence (spots, sessions, feedback, learned profile). Personal data, offline-first — matches your existing pattern. Optional **Supabase** sync layer later if you want cross-device.
- Ship the **61-spot dataset** as seed JSON (you have it in `cebu_date_spots.xlsx` → export the `Spots` tab to JSON).

Model: `claude-sonnet-4-6` for planning + finisher. Cheap, fast, structured-output friendly. Bump to a larger model only if sequencing quality demands it.

---

## 3. Data model

### `spots` (seed + user-added)
Existing columns from the sheet, plus two normalized fields you need to add:

```ts
type Spot = {
  id: string;
  name: string;
  category: string;
  area: string;            // "Lahug", "IT Park", "Mandaue"...
  city: string;
  price: "Free"|"$"|"$$"|"$$$";
  best_time: string;       // "afternoon"|"evening"|"golden hour"|"late night"|"morning"
  vibe: string;
  tags: string[];          // split the CSV string into an array
  move: string;            // the insider angle
  rating: number|null;
  lat: number|null;
  lng: number|null;
  // ADD THESE for v2:
  hours: WeeklyHours;      // structured, see below — replaces the free-text "hours"
  source: "verified"|"social";
};

type WeeklyHours = {
  // 0=Sun..6=Sat; null = closed that day
  [day: number]: { open: string; close: string }[] | null; // "16:00","02:00"
};
```

**Prep task:** normalize the free-text `hours` column into `WeeklyHours`. The verified spots (source=places) have clean hours in the sheet; the `social` ones are marked "verify" — leave `hours` null and treat null as "unknown, don't hard-filter, just warn."

### `sessions` (one per planned/run date)
```ts
type Session = {
  id: string;
  createdAt: number;
  prompt: string;
  budget: string; window: string;
  personId: string|null;   // optional link to a companion profile
  plan: PlannedStop[];     // what was suggested
  status: "planned"|"ran"|"skipped";
};
type PlannedStop = { spotId: string; order: number; time: string; activity: string; why: string };
```

### `feedback`
```ts
type Feedback = {
  sessionId: string;
  spotId: string|null;     // null = overall-date feedback
  went: boolean;
  rating: -1|0|1|2;        // bombed / meh / good / great
  note: string;            // free text: "she loved the matcha", "too loud"
  createdAt: number;
};
```

### `people` (optional, lightweight — enables per-person learning + better finishers)
```ts
type Person = {
  id: string;
  name: string;            // or an alias
  notes: string[];         // "prefers afternoons", "dislikes crowds", "vegan"
};
```

### `profile` (derived — the learned preferences)
Not entered by hand. Recomputed from `feedback`. One global + one per person.
```ts
type Profile = {
  tagScores: Record<string, number>;
  catScores: Record<string, number>;
  areaScores: Record<string, number>;
  winners: string[];       // spotIds repeatedly rated good/great
  avoid: string[];         // spotIds rated bombed
  notes: string[];         // pulled-forward free-text learnings
};
```

---

## 4. Flow A — plan a date

### 4.1 Candidate selection (do this in code, before the LLM)

Don't dump all 61 spots at the model every time — it gets worse as the dataset grows. Narrow first, let the LLM sequence.

1. **Parse the prompt** into intent tags. Either a cheap LLM call or a keyword map over your tag vocabulary (matcha→`matcha`, "cats"→`cats`, "impress/cocktails"→`speakeasy`, etc.).
2. **Score every spot:**
   ```
   score(spot) =
       matchScore(intentTags, spot.tags)          // tag overlap, weighted
     + learnedScore(spot, profile)                 // Σ tagScores + catScores + areaScores
     + (winners.includes(spot.id) ? +3 : 0)
     - (avoid.includes(spot.id)   ? 99 : 0)        // effectively drop it
   ```
3. **Hard filters:**
   - **Window:** if window=night, keep spots whose `best_time` ∈ {evening, golden hour, late night}; day → {morning, afternoon, golden hour}. `best_time` unknown → keep.
   - **Hours:** if `hours` known and the spot is closed for the chosen day/window, drop it. Unknown hours → keep but tag `unverified`.
   - **Budget:** soft — penalize out-of-budget, don't drop (a single $$$ finisher spot can be worth it).
4. **Geo-cluster:** pick the top-scored spot as the **anchor**. Compute haversine distance from anchor to every other candidate. Prefer candidates within ~3–4 km OR sharing/adjacent `area`. This kills the north-to-south bounce.
5. Take the **top ~10–12 candidates** → hand to the LLM to choose and sequence 3–4.

```ts
function haversineKm(a:{lat:number,lng:number}, b:{lat:number,lng:number}){
  const R=6371, d=(x:number)=>x*Math.PI/180;
  const dLat=d(b.lat-a.lat), dLng=d(b.lng-a.lng);
  const s=Math.sin(dLat/2)**2 + Math.cos(d(a.lat))*Math.cos(d(b.lat))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}
```

### 4.2 LLM sequencing call (`/api/plan`)

System prompt:
```
You are a Cebu date-route planner. You are given CANDIDATE spots already filtered for
fit, opening hours, and location. Choose 3 or 4 that form ONE coherent date and order
them as a natural arc: lighter/coffee/craft earlier, food in the middle, views or bars
to close. Keep the geographic flow tight. Honor the budget/window loosely — don't force
a bad match. If a learned profile is provided, lean into liked tags and proven winners,
and steer clear of disliked ones. Reference each spot only by its exact id.

Return ONLY raw JSON, no markdown:
{
  "title": "<= 6 words",
  "summary": "<= 28 words, why this route fits",
  "stops": [
    { "id": "<candidate id>", "time": "3:00 PM",
      "activity": "<= 24 words: concretely what to do here, tuned to the prompt",
      "why": "<= 12 words" }
  ]
}
```

User message payload:
```
Description: "<prompt>"
Budget: <…>  Window: <…>
Learned profile: favor [<tags>]; avoid [<tags>]; winners [<names>]; notes: <…>
Person notes (if any): <…>
CANDIDATES: <json: id,name,category,area,price,best_time,tags,move for the top ~12>
```

Hydrate the returned `stops[].id` back to full Spot records from your DB so names/coords/move are always real (the model can't invent a venue — same guard as the prototype).

### 4.3 Activity suggestions
The `activity` field already does this per stop. If you want a deeper "things to do here" list, add a second optional call per stop or ask for `activity` + `alt` (a fallback activity). Keep it in the same JSON to save round-trips.

---

## 5. Flow B — the finisher

End-of-date message generator. Lives on the same screen as feedback logging.

**Inputs**
- Which session/stops you actually did (auto from the plan, toggle off any you skipped).
- Your read: `went great` / `was good` / `unsure` / `not feeling it`.
- Your intent: `want a second date` / `keep it open` / `keep it casual` / `just being kind`.
- Optional: a moment to anchor on ("she lit up at the pottery place").

**Voice** (this is yours — bake it in): lowercase, ellipsis-friendly, no emoji stacks, casual, a little understated. Reference a **real** moment from the actual stops so it doesn't read generic. One concrete next step only if intent = second date.

**Principle:** genuine, not tactical. Express real interest, recall a shared moment, make a clear ask if he wants one. No negging, no pressure, no manufactured scarcity.

System prompt (`/api/finisher`):
```
Write end-of-date text message drafts for the user to send the person they just went
out with. Voice: lowercase, casual, ellipsis-friendly, understated, NO emoji stacks
(one is the ceiling). Ground every draft in the ACTUAL stops/moments provided — name a
real thing from the date. Match the user's read of how it went and their intent. If the
intent is a second date, end with one easy, concrete suggestion. Keep each draft to
1–3 short lines. Be genuine, never manipulative — no pressure, no games.

Return ONLY raw JSON:
{ "messages": [
  { "label": "warm + direct", "text": "..." },
  { "label": "playful",       "text": "..." },
  { "label": "low-key",       "text": "..." }
] }
```

User payload:
```
Stops we did: <names + the move/vibe of each>
Anchor moment: <optional>
How it went: <read>
Intent: <intent>
Her notes (if any): <…>
```

Render the 2–3 drafts with a copy button each. (You can reuse the artifact's `copyPlan` pattern.)

---

## 6. Flow C — feedback → decision-making

### 6.1 Capture
On the finisher screen, after the message: quick per-stop rating (bombed / meh / good / great) + optional note, plus one overall-date rating. Tag it to a `personId` if set. Write `Feedback` rows.

### 6.2 Update the profile (pure function, runs on every new feedback)
```ts
const W = { tag: 1, cat: 0.6, area: 0.4 };
function applyFeedback(profile: Profile, fb: Feedback, spot: Spot){
  if (!spot) return profile;
  const r = fb.rating; // -1..+2
  for (const t of spot.tags)      profile.tagScores[t]  = (profile.tagScores[t]??0)  + r*W.tag;
  profile.catScores[spot.category]= (profile.catScores[spot.category]??0)+ r*W.cat;
  profile.areaScores[spot.area]   = (profile.areaScores[spot.area]??0)   + r*W.area;
  if (r >= 1 && !profile.winners.includes(spot.id)) profile.winners.push(spot.id);
  if (r <= -1 && !profile.avoid.includes(spot.id))  profile.avoid.push(spot.id);
  if (fb.note) profile.notes = dedupeKeepRecent([...profile.notes, fb.note], 12);
  return profile;
}
```
Maintain a **global** profile and a **per-person** profile. When planning for a known person, blend them (per-person notes win on conflict).

Optional refinements once it's working: time-decay old scores (multiply by 0.95 weekly) so taste can drift; cap scores to avoid one bombed night nuking a whole category.

### 6.3 Inject
Section 4.1 already consumes `profile` in `learnedScore` (code-side re-ranking) and 4.2 passes a compact summary into the prompt. That's the whole loop — feedback changes the candidate scores, which changes what the LLM ever sees.

---

## 7. Prompt library (all in one place)

Keep these as versioned template files (`/prompts/plan.txt`, `/prompts/finisher.txt`) so Claude Code can iterate on them without touching app logic. Both are reproduced in §4.2 and §5. Always:
- demand raw JSON, strip ```` ```json ```` fences before parsing,
- slice from first `{` to last `}` before `JSON.parse`,
- filter returned ids against your known set,
- fail soft: if < 2 valid stops, re-ask once, then show a friendly retry.

---

## 8. Build phases

1. **Port the core.** Next.js shell, seed the 61 spots, `/api/plan` server route, reproduce the prototype's plan → route UI (carry over the dusk aesthetic — see your `DESIGN.md`). Browser → server API move.
2. **v2 candidate engine.** Add structured `hours`, the code-side score + geo-cluster + hours/window filter, hand top-12 to the LLM. This fixes the two prototype limits (geo bounce, closed-spot suggestions).
3. **Finisher.** `/api/finisher`, the finisher screen, your-voice message drafts, copy buttons.
4. **Feedback + profile.** Dexie tables, capture UI on the finisher screen, `applyFeedback`, wire `profile` into §4.1.
5. **People.** Lightweight companion profiles → per-person learning + personalized finishers.
6. **Polish.** Decay, score caps, "winners" shortcut ("plan me a proven one"), optional Supabase sync, add-a-spot form.

---

## 9. iOS home-screen app (PWA)

You're not shipping a native app — you're shipping an installable **PWA**: deploy the Next.js site, open it in Safari, **Share → Add to Home Screen**. It then launches full-screen with its own icon, no Safari chrome. That's the right move (no App Store, no Swift). But iOS ignores parts of the web manifest and needs Apple-specific handling, so do these or it'll feel like a webpage in a frame.

### 9.1 Manifest — `app/manifest.ts`
```ts
import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Date Architect', short_name: 'Dates',
    start_url: '/', display: 'standalone', orientation: 'portrait',
    background_color: '#201823', theme_color: '#201823',  // dusk bg = no white launch
    icons: [
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

### 9.2 Apple meta — `app/layout.tsx`
iOS reads these, not the manifest's display/theme. Next's metadata API emits them:
```ts
export const metadata = {
  title: 'Date Architect',
  appleWebApp: { capable: true, title: 'Dates', statusBarStyle: 'black-translucent' },
};
export const viewport = {
  themeColor: '#201823',
  viewportFit: 'cover',   // lets the dusk bg run under the notch + home indicator
};
```
- `statusBarStyle: 'black-translucent'` makes the status bar sit *over* your dark bg — looks native. (It means content goes under the clock, so you need safe-area padding below.)
- **apple-touch-icon:** drop `app/apple-icon.png` at **180×180, fully opaque** (iOS adds its own rounding — transparency leaves ugly black corners). Pick a route/compass/ember mark, not a screenshot.

### 9.3 Safe areas — the thing that makes it feel native
With `viewport-fit=cover`, you must inset content yourself or the composer hides under the notch and the route's last stop sits under the home indicator. Replace the static body padding:
```css
body{
  min-height: 100dvh;                                   /* dvh, not vh — handles the dynamic toolbar */
  padding-top:    max(env(safe-area-inset-top), 18px);
  padding-bottom: max(env(safe-area-inset-bottom), 18px);
  padding-left:   max(env(safe-area-inset-left), 16px);
  padding-right:  max(env(safe-area-inset-right), 16px);
}
```

### 9.4 Offline / service worker
The 61 spots are seeded locally, so saved plans + browsing work offline. Only the **LLM calls need network** (planning, finisher). Use **Serwist** (`@serwist/next` — the maintained next-pwa successor that supports the App Router):
- precache the app shell + seed dataset,
- network-first for `/api/*`,
- if a plan/finisher request fails offline → show an "needs connection to plan" banner, don't crash.

Detect connection and the launch mode:
```ts
const standalone = window.matchMedia('(display-mode: standalone)').matches
  || (navigator as any).standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
// iOS has no install prompt — if Safari + not installed, show a one-time hint:
if (isIOS && !standalone) showHint('tap Share → Add to Home Screen to install');
```

### 9.5 Don't lose your data (important)
iOS can **evict IndexedDB** under storage pressure or after ~7 days unused (ITP). Your `feedback` + learned `profile` is the valuable state — protect it:
```ts
if (navigator.storage?.persist) await navigator.storage.persist();  // request durable storage
```
Persistence isn't guaranteed on iOS, so if you care about not losing the learned profile, this is the argument for turning on the **Supabase sync** from §2/§8 as a durable backup. For a personal app you open regularly, `persist()` + occasional sync is plenty.

### 9.6 Deploy
- Push to **Vercel**; the API key lives in Vercel env vars, server-side only. The home-screen icon just wraps that deployed URL — the key never ships to the phone.
- Add **that production URL** to the home screen (not a localhost/preview).
- iOS only installs PWAs over **HTTPS** (Vercel gives you that free).

---

## Notes

- The dataset has `source: social` spots with unverified hours/coords. Gate map links and hours-filtering on verified data; show a small "verify" badge on social spots.
- Keep the LLM as the *sequencer/writer*, not the *source of truth* for places — always hydrate from your DB. It's the guardrail against hallucinated venues.
- Two thin spots in the current data: plant/garden cafes (the good ones are north) and niche/weird beyond the Jesuit House. Worth a data pass before launch if those lanes matter to you.
