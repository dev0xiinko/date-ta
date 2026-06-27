import type { Window } from "@/lib/types";

// Cheap keyword → tag mapping over the dataset's ACTUAL tag vocabulary (spec
// §4.1.1). Every output tag below exists in seed/spots.json — keep it that way
// when editing, or the term scores nothing. A free first pass; can be swapped
// for an LLM intent call later.
const KEYWORD_TAGS: Record<string, string[]> = {
  // coffee & cafes
  matcha: ["matcha", "coffee"],
  coffee: ["coffee", "specialty-coffee"],
  "specialty coffee": ["specialty-coffee", "coffee"],
  cafe: ["coffee", "cozy"],
  brunch: ["coffee", "pastries"],
  // sweets
  dessert: ["dessert"],
  chocolate: ["dessert"],
  gelato: ["gelato", "dessert"],
  pastries: ["pastries"],
  bakery: ["pastries"],
  // animals
  cat: ["cats"],
  cats: ["cats"],
  // making things
  pottery: ["pottery", "crafting", "workshop"],
  ceramics: ["pottery", "crafting"],
  art: ["art", "aesthetic"],
  gallery: ["art", "cultural"],
  creative: ["art", "crafting"],
  craft: ["crafting", "workshop"],
  crafts: ["crafting", "workshop"],
  workshop: ["workshop", "crafting"],
  // drinks / nightlife (dataset tags these "speakeasy"/"late-night")
  wine: ["speakeasy", "romantic"],
  cocktail: ["speakeasy", "late-night"],
  cocktails: ["speakeasy", "late-night"],
  drinks: ["speakeasy", "late-night"],
  bar: ["speakeasy", "late-night"],
  speakeasy: ["speakeasy", "late-night"],
  nightlife: ["late-night", "speakeasy"],
  "late night": ["late-night"],
  // mood / romance
  impress: ["romantic", "view", "speakeasy"],
  romantic: ["romantic"],
  intimate: ["romantic", "hidden"],
  // views / outdoors (dataset uses "nature", no garden/scenic tags)
  view: ["view", "sunset"],
  views: ["view", "sunset"],
  sunset: ["sunset", "view"],
  scenic: ["view", "nature"],
  rooftop: ["rooftop", "view"],
  garden: ["nature"],
  plants: ["nature"],
  nature: ["nature"],
  outdoors: ["nature", "view"],
  // culture / quirk
  history: ["cultural"],
  historic: ["cultural"],
  museum: ["cultural"],
  cultural: ["cultural"],
  culture: ["cultural"],
  weird: ["niche", "quirky", "unique"],
  niche: ["niche", "quirky"],
  quirky: ["quirky", "niche"],
  unique: ["unique"],
  immersive: ["immersive", "unique"],
  adventure: ["adventurous"],
  adventurous: ["adventurous"],
  // food
  foodie: ["food"],
  food: ["food"],
  dinner: ["food"],
  "street food": ["food"],
  hookah: ["hookah", "shisha"],
  shisha: ["shisha", "hookah"],
  indian: ["indian", "food"],
  biryani: ["indian", "food"],
  curry: ["indian", "food"],
  // games & activities
  game: ["games", "board-games", "arcade"],
  games: ["games", "board-games", "arcade"],
  "board game": ["board-games", "games"],
  arcade: ["arcade", "games"],
  karaoke: ["games"],
  // music
  music: ["music", "vinyl"],
  vinyl: ["vinyl", "music"],
  // photos / aesthetic
  photo: ["photos"],
  photos: ["photos"],
  photobooth: ["photos", "nostalgia"],
  retro: ["nostalgia", "photos"],
  nostalgia: ["nostalgia"],
  aesthetic: ["aesthetic"],
  pretty: ["aesthetic"],
  themed: ["themed"],
  // tone / budget
  cozy: ["cozy"],
  chill: ["chill", "cozy"],
  quiet: ["cozy", "hidden"],
  relaxed: ["chill", "cozy"],
  lowkey: ["chill", "hidden"],
  "low key": ["chill", "hidden"],
  "low pressure": ["chill", "cozy"],
  hidden: ["hidden"],
  secret: ["hidden"],
  cheap: ["affordable"],
  affordable: ["affordable"],
  free: ["free"],
};

export type ParsedIntent = {
  tags: string[];
  window: Window | null; // explicit day/night signal, if any
  nearArea: string | null; // a Cebu area/place mentioned in the prompt
  stopCount: number | null; // explicit "2 spots" / "a couple"
  startTime: string | null; // explicit clock time, e.g. "7pm"
};

const NIGHT_WORDS = ["night", "evening", "dinner", "late", "drinks", "bar", "cocktail", "sunset"];
const DAY_WORDS = ["morning", "brunch", "afternoon", "daytime", "lunch"];

// Cebu place keywords matched against spot `area` strings (longest/most
// specific first so "it park" wins over "ayala", etc.).
const PLACES = [
  "it park", "as fortuna", "sm seaside", "nivel hills", "ayala central bloc",
  "lahug", "banilad", "mandaue", "busay", "cordova", "capitol", "mabolo",
  "talamban", "banawa", "fuente", "urgello", "kasambagan", "liloan",
  "consolacion", "minglanilla", "downtown", "escario", "tisa", "apas",
  "ayala", "mango",
];

const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, couple: 2, few: 3 };

function hourOf(time: string): number | null {
  const m = time.toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = +m[1];
  const mer = m[3];
  if (mer === "pm" && h !== 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  return h;
}

/** Parse a free-text prompt into intent tags, window, location, count, and time. */
export function parsePrompt(prompt: string): ParsedIntent {
  const lower = ` ${prompt.toLowerCase()} `;
  const tags = new Set<string>();

  for (const [keyword, mapped] of Object.entries(KEYWORD_TAGS)) {
    if (lower.includes(keyword)) mapped.forEach((t) => tags.add(t));
  }

  // location
  const nearArea = PLACES.find((p) => lower.includes(p)) ?? null;

  // stop count: "2 spots" / "two stops" / "a couple"
  let stopCount: number | null = null;
  const digit = lower.match(/(\d+)\s*(?:spots?|stops?|places?|stop)/);
  if (digit) stopCount = +digit[1];
  else {
    for (const [w, n] of Object.entries(NUM_WORDS)) {
      if (new RegExp(`\\b${w}\\b\\s*(?:spots?|stops?|places?)`).test(lower) || (w === "couple" && /\ba couple\b/.test(lower))) {
        stopCount = n;
        break;
      }
    }
  }
  if (stopCount != null) stopCount = Math.max(2, Math.min(5, stopCount));

  // explicit clock time, e.g. "at 7pm", "3:30 pm"
  const tm = prompt.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  const startTime = tm ? tm[1].replace(/\s+/g, "").toLowerCase() : null;

  // window: word signals, overridden by an explicit clock time
  let window: Window | null = null;
  const nightHits = NIGHT_WORDS.filter((w) => lower.includes(w)).length;
  const dayHits = DAY_WORDS.filter((w) => lower.includes(w)).length;
  if (nightHits > dayHits) window = "night";
  else if (dayHits > nightHits) window = "day";
  if (startTime) {
    const h = hourOf(startTime);
    if (h != null) window = h >= 17 || h < 6 ? "night" : "day";
  }

  return { tags: [...tags], window, nearArea, stopCount, startTime };
}
