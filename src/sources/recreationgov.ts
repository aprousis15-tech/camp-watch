import { fetch } from "undici";
import { TRIP, USER_AGENT } from "../config.ts";
import type { RecreationGovPark } from "../parks.ts";
import type { Opening } from "../types.ts";

// Recreation.gov public month-availability endpoint.
// Returns per-campsite availability map for a calendar month.
// e.g. https://www.recreation.gov/api/camps/availability/campground/233116/month?start_date=2026-05-01T00:00:00.000Z
const MONTH_ENDPOINT = (campgroundId: string, monthStartIso: string) =>
  `https://www.recreation.gov/api/camps/availability/campground/${campgroundId}/month?start_date=${encodeURIComponent(monthStartIso)}`;

type MonthResponse = {
  campsites?: Record<
    string,
    {
      campsite_id: string;
      site: string; // visible name like "001"
      campsite_type?: string;
      type_of_use?: string;
      // Map of ISO datetime -> "Available" | "Reserved" | "Not Available" | "Open" | etc.
      availabilities: Record<string, string>;
      quantities?: Record<string, number>;
    }
  >;
};

const TENT_TYPES = new Set([
  "STANDARD NONELECTRIC",
  "TENT ONLY NONELECTRIC",
  "TENT ONLY ELECTRIC",
  "WALK TO",
  "HIKE TO",
  "BOAT IN",
  "STANDARD ELECTRIC",
]);

function monthStartIso(iso: string): string {
  // Returns YYYY-MM-01T00:00:00.000Z for the trip month.
  const [y, m] = iso.split("-");
  return `${y}-${m}-01T00:00:00.000Z`;
}

export async function checkRecreationGov(park: RecreationGovPark): Promise<Opening[]> {
  const monthIso = monthStartIso(TRIP.checkIn);
  const res = await fetch(MONTH_ENDPOINT(park.campgroundId, monthIso), {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      Referer: `https://www.recreation.gov/camping/campgrounds/${park.campgroundId}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Recreation.gov ${park.name}: HTTP ${res.status}`);
  }

  const data = (await res.json()) as MonthResponse;
  const sites = data.campsites ?? {};
  const openings: Opening[] = [];

  // Nights we need available (check-in inclusive, check-out exclusive).
  const nights: string[] = [];
  const start = new Date(TRIP.checkIn + "T00:00:00Z");
  for (let i = 0; i < TRIP.nights; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    nights.push(d.toISOString().slice(0, 10));
  }

  for (const site of Object.values(sites)) {
    // Filter to tent-friendly sites where the type is known.
    if (site.campsite_type && !TENT_TYPES.has(site.campsite_type.toUpperCase())) {
      continue;
    }
    const avail = site.availabilities ?? {};
    const allOpen = nights.every((iso) => {
      const key = Object.keys(avail).find((k) => k.startsWith(iso));
      if (!key) return false;
      const status = (avail[key] || "").toLowerCase();
      return status === "available" || status === "open";
    });
    if (!allOpen) continue;

    const url = `https://www.recreation.gov/camping/campsites/${site.campsite_id}`;
    openings.push({
      source: "recreationgov",
      parkName: park.name,
      siteName: site.site || `Site ${site.campsite_id}`,
      checkIn: TRIP.checkIn,
      checkOut: TRIP.checkOut,
      url,
      dedupeKey: `rg:${park.campgroundId}:${site.campsite_id}:${TRIP.checkIn}:${TRIP.checkOut}`,
    });
  }

  return openings;
}
