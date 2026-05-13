// The 11 Hipcamp listings to monitor, taken directly from the
// "Two camping weekends · v6" artifact. Skip-rated sites (Larkspurs Hollow,
// Redwood Paradise, Sacred Earth Retreat) are intentionally omitted.

export type Tier = "top" | "gold" | "standard";

export type Listing = {
  rank: number;
  trip: "A" | "B";
  name: string;
  // Used by the slug resolver — typed into Hipcamp's search box.
  searchQuery: string;
  // Region hint to disambiguate when the search returns multiple matches.
  locationHint: string;
  tier: Tier;
  // Filled in by resolveSlugs at runtime, cached in slugs.json.
  slug?: string;
};

// Trip A — Memorial Day Weekend, Fri May 22 – Mon May 25, 2026 (3 nights).
export const TRIP_A_LISTINGS: Listing[] = [
  { rank: 1, trip: "A", name: "Timber Cove", searchQuery: "Timber Cove", locationHint: "Jenner, Sonoma Coast", tier: "top" },
  { rank: 2, trip: "A", name: "Camp Nauvoo", searchQuery: "Camp Nauvoo", locationHint: "Placerville, El Dorado", tier: "top" },
  { rank: 3, trip: "A", name: "Mendocino Magic — Cannonball", searchQuery: "Mendocino Magic Cannonball", locationHint: "Laytonville, Mendocino", tier: "gold" },
  { rank: 4, trip: "A", name: "Stemple Creek Ranch", searchQuery: "Stemple Creek Ranch", locationHint: "Tomales, Marin", tier: "gold" },
  { rank: 5, trip: "A", name: "Quail Ridge Farm", searchQuery: "Quail Ridge Farm", locationHint: "Los Gatos", tier: "gold" },
  { rank: 6, trip: "A", name: "Sun/Moon Rise Camp w/ Valley View", searchQuery: "Sun Moon Rise Camp Valley View", locationHint: "Aptos, Day Valley", tier: "standard" },
  { rank: 7, trip: "A", name: "Comptche Matrix @ Sunny-land", searchQuery: "Comptche Matrix Sunny-land", locationHint: "Comptche, Mendocino", tier: "standard" },
  { rank: 8, trip: "A", name: "Red Dragonfly Ranch", searchQuery: "Red Dragonfly Ranch Yosemite", locationHint: "Groveland, Yosemite gateway", tier: "standard" },
];

// Trip B — weekend after MDW, Fri May 29 – Mon Jun 1, 2026 (3 nights).
export const TRIP_B_LISTINGS: Listing[] = [
  { rank: 1, trip: "B", name: "A California Dream: Camp Hoppy", searchQuery: "California Dream Camp Hoppy", locationHint: "Cazadero, Sonoma", tier: "top" },
  { rank: 2, trip: "B", name: "Banks Ranch in the Redwoods", searchQuery: "Banks Ranch in the Redwoods", locationHint: "Bonny Doon, Santa Cruz", tier: "gold" },
  { rank: 3, trip: "B", name: "Finley Camp", searchQuery: "Finley Camp", locationHint: "Bodega, Sonoma", tier: "standard" },
];

export const ALL_LISTINGS: Listing[] = [...TRIP_A_LISTINGS, ...TRIP_B_LISTINGS];
