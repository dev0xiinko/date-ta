import type { Window } from "@/lib/types";

// Cheap keyword → tag mapping over the dataset's tag vocabulary. Spec §4.1.1.
// A free first pass; can be swapped for an LLM intent call later.
const KEYWORD_TAGS: Record<string, string[]> = {
  matcha: ["matcha", "coffee"],
  coffee: ["coffee"],
  cafe: ["coffee", "chill"],
  chocolate: ["chocolate", "dessert"],
  dessert: ["dessert"],
  gelato: ["gelato", "dessert"],
  cat: ["cats"],
  cats: ["cats"],
  pottery: ["pottery", "hands-on", "creative"],
  art: ["creative", "hands-on"],
  creative: ["creative", "hands-on"],
  craft: ["hands-on", "creative"],
  wine: ["wine"],
  cocktail: ["cocktails", "bar"],
  cocktails: ["cocktails", "bar"],
  drinks: ["cocktails", "bar", "drinks"],
  bar: ["bar", "cocktails"],
  speakeasy: ["cocktails", "bar"],
  impress: ["romantic", "view", "cocktails"],
  romantic: ["romantic", "intimate"],
  intimate: ["intimate", "romantic"],
  view: ["view", "scenic", "sunset"],
  views: ["view", "scenic", "sunset"],
  sunset: ["sunset", "view", "golden hour"],
  scenic: ["scenic", "view"],
  rooftop: ["rooftop", "view"],
  garden: ["garden", "plants", "outdoor"],
  plants: ["plants", "garden"],
  nature: ["garden", "outdoor", "scenic"],
  history: ["history", "museum"],
  historic: ["history", "museum"],
  museum: ["museum", "history"],
  weird: ["niche", "quirky"],
  niche: ["niche", "quirky"],
  quirky: ["quirky", "niche"],
  foodie: ["food", "dinner"],
  food: ["food"],
  dinner: ["dinner", "food"],
  brunch: ["brunch", "coffee"],
  "street food": ["street food", "food"],
  lively: ["lively"],
  chill: ["chill", "quiet"],
  quiet: ["quiet", "chill"],
  relaxed: ["chill", "quiet"],
  walk: ["walk", "outdoor"],
  music: ["music"],
};

export type ParsedIntent = {
  tags: string[];
  window: Window | null; // explicit day/night signal, if any
};

const NIGHT_WORDS = ["night", "evening", "dinner", "late", "drinks", "bar", "cocktail", "sunset"];
const DAY_WORDS = ["morning", "brunch", "afternoon", "daytime", "lunch", "coffee"];

/** Parse a free-text prompt into intent tags + an optional window signal. */
export function parsePrompt(prompt: string): ParsedIntent {
  const lower = ` ${prompt.toLowerCase()} `;
  const tags = new Set<string>();

  for (const [keyword, mapped] of Object.entries(KEYWORD_TAGS)) {
    if (lower.includes(keyword)) mapped.forEach((t) => tags.add(t));
  }

  let window: Window | null = null;
  const nightHits = NIGHT_WORDS.filter((w) => lower.includes(w)).length;
  const dayHits = DAY_WORDS.filter((w) => lower.includes(w)).length;
  if (nightHits > dayHits) window = "night";
  else if (dayHits > nightHits) window = "day";

  return { tags: [...tags], window };
}
