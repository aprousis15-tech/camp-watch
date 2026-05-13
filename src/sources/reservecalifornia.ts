import { fetch } from "undici";
import { TRIP, USER_AGENT } from "../config.ts";
import type { ReserveCaliforniaPark } from "../parks.ts";
import type { Opening } from "../types.ts";

const GRID_ENDPOINT = "https://calirdr.usedirect.com/RDR/rdr/search/grid";
const PLACE_ENDPOINT = "https://calirdr.usedirect.com/RDR/rdr/search/place";

const STD_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": USER_AGENT,
  Accept: "application/json",
  Origin: "https://www.reservecalifornia.com",
  Referer: "https://www.reservecalifornia.com/",
};

// MM-DD-YYYY for UseDirect.
function fmtUseDirect(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}-${d}-${y}`;
}

type PlaceSearchResponse = {
  RecordCount?: number;
  SelectedPlaceId?: number;
  Places?: Array<{
    PlaceId: number;
    Name: string;
    Facilities?: Record<string, { FacilityId: number; Name: string }>;
  }>;
};

// Resolves a park name to {placeId, facilityId} by querying UseDirect's
// place-search endpoint. Falls back to null if not found. The result is
// cached in-memory for the run.
const resolutionCache = new Map<string, { placeId: number; facilityId: number } | null>();

export async function resolveRCByName(name: string): Promise<{ placeId: number; facilityId: number } | null> {
  if (resolutionCache.has(name)) return resolutionCache.get(name)!;

  const body = {
    PageIndex: 0,
    PageSize: 50,
    NearbyLimit: 0,
    Sort: "Distance",
    HighlightedPlaceId: 0,
    CustomerId: "0",
    PlaceId: 0,
    Latitude: 0,
    Longitude: 0,
    CountyName: null,
    ParkSize: null,
    FilterText: name,
    StartDate: fmtUseDirect(TRIP.checkIn),
    Nights: TRIP.nights,
    UnitTypeId: 0,
    UnitCategoryId: 0,
    InSeasonOnly: true,
    WebOnly: true,
    UnitTypesGroupIds: [],
    Sleeps: TRIP.maxPeople,
    MinVehicleLength: 0,
    IsADA: false,
  };

  let parsed: PlaceSearchResponse;
  try {
    const res = await fetch(PLACE_ENDPOINT, {
      method: "POST",
      headers: STD_HEADERS,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      resolutionCache.set(name, null);
      return null;
    }
    parsed = (await res.json()) as PlaceSearchResponse;
  } catch {
    resolutionCache.set(name, null);
    return null;
  }

  // Pick the best match: exact (case-insensitive) on Name, else first result.
  const places = parsed.Places ?? [];
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const target = norm(name);
  const match =
    places.find((p) => norm(p.Name) === target) ??
    places.find((p) => norm(p.Name).includes(target) || target.includes(norm(p.Name))) ??
    places[0];

  if (!match || !match.Facilities) {
    resolutionCache.set(name, null);
    return null;
  }

  // Prefer the first reservable facility (campgrounds usually have one).
  const facility = Object.values(match.Facilities)[0];
  if (!facility) {
    resolutionCache.set(name, null);
    return null;
  }

  const result = { placeId: match.PlaceId, facilityId: facility.FacilityId };
  resolutionCache.set(name, result);
  return result;
}

type GridResponse = {
  Facility?: {
    Units?: Record<
      string,
      {
        UnitId: number;
        Name: string;
        ShortName?: string;
        IsAda?: boolean;
        Slices?: Record<
          string,
          { Date: string; IsFree?: boolean; IsBlocked?: boolean; IsWalkin?: boolean }
        >;
      }
    >;
  };
};

export async function checkReserveCalifornia(park: ReserveCaliforniaPark): Promise<Opening[]> {
  let placeId = park.placeId;
  let facilityId = park.facilityId;

  if (placeId == null || facilityId == null) {
    const resolved = await resolveRCByName(park.name);
    if (!resolved) {
      throw new Error(`Could not resolve UseDirect IDs for "${park.name}"`);
    }
    placeId = resolved.placeId;
    facilityId = resolved.facilityId;
  }

  const body = {
    FacilityId: facilityId,
    StartDate: fmtUseDirect(TRIP.checkIn),
    EndDate: fmtUseDirect(TRIP.checkOut),
    Nights: String(TRIP.nights),
    Sleeps: TRIP.maxPeople,
    MinVehicleLength: 0,
    UnitCategoryId: 0,
    StartTime: null,
    EndTime: null,
    UnitTypesGroupIds: [],
    UnitTypeId: 0,
    InSeasonOnly: true,
    WebOnly: true,
    IsADA: false,
    PlaceId: placeId,
  };

  const res = await fetch(GRID_ENDPOINT, {
    method: "POST",
    headers: STD_HEADERS,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`ReserveCalifornia ${park.name}: HTTP ${res.status}`);
  }

  const data = (await res.json()) as GridResponse;
  const units = data.Facility?.Units ?? {};
  const openings: Opening[] = [];

  const nights: string[] = [];
  const start = new Date(TRIP.checkIn + "T00:00:00");
  for (let i = 0; i < TRIP.nights; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    nights.push(d.toISOString().slice(0, 10));
  }

  for (const unit of Object.values(units)) {
    const slices = unit.Slices ?? {};
    const allFree = nights.every((iso) => {
      const slice = Object.values(slices).find((s) => s.Date?.startsWith(iso));
      return slice && slice.IsFree && !slice.IsBlocked;
    });
    if (!allFree) continue;

    const url = `https://www.reservecalifornia.com/Web/Default.aspx?#!park/${placeId}/${facilityId}`;
    openings.push({
      source: "reservecalifornia",
      parkName: park.name,
      siteName: unit.Name || unit.ShortName || `Unit ${unit.UnitId}`,
      checkIn: TRIP.checkIn,
      checkOut: TRIP.checkOut,
      url,
      dedupeKey: `rc:${facilityId}:${unit.UnitId}:${TRIP.checkIn}:${TRIP.checkOut}`,
    });
  }

  return openings;
}
