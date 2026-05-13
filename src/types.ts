import type { Tier } from "./listings.ts";

export type Opening = {
  // Identifier (e.g. trip + listing name).
  tripId: "A" | "B";
  tripLabel: string;
  rank: number;
  tier: Tier;
  listingName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  // Direct booking URL with arrive/depart preselected.
  url: string;
  // Stable key for dedupe.
  dedupeKey: string;
};
