// Curated list of campgrounds within ~2.5h drive of North Beach, SF.
// Recreation.gov IDs verified via /api/search. ReserveCalifornia IDs are
// best-guess and get auto-resolved at runtime by name (see resolveRC()).

export type ReserveCaliforniaPark = {
  source: "reservecalifornia";
  name: string;
  // Filled in by name-based search if missing/wrong.
  placeId?: number;
  facilityId?: number;
  driveMinutesFromSF: number;
};

export type RecreationGovPark = {
  source: "recreationgov";
  name: string;
  campgroundId: string;
  driveMinutesFromSF: number;
};

export type Park = ReserveCaliforniaPark | RecreationGovPark;

// We pass these names to UseDirect's search-by-name endpoint at startup to
// resolve PlaceId/FacilityId, then cache. If the lookup fails the park is
// skipped for that run and the failure is logged.
export const RESERVECALIFORNIA_PARKS: ReserveCaliforniaPark[] = [
  { source: "reservecalifornia", name: "Mount Tamalpais SP", driveMinutesFromSF: 45 },
  { source: "reservecalifornia", name: "Samuel P. Taylor SP", driveMinutesFromSF: 60 },
  { source: "reservecalifornia", name: "China Camp SP", driveMinutesFromSF: 40 },
  { source: "reservecalifornia", name: "Mount Diablo SP", driveMinutesFromSF: 75 },
  { source: "reservecalifornia", name: "Sugarloaf Ridge SP", driveMinutesFromSF: 90 },
  { source: "reservecalifornia", name: "Bothe-Napa Valley SP", driveMinutesFromSF: 90 },
  { source: "reservecalifornia", name: "Sonoma Coast SP", driveMinutesFromSF: 95 },
  { source: "reservecalifornia", name: "Salt Point SP", driveMinutesFromSF: 130 },
  { source: "reservecalifornia", name: "Big Basin Redwoods SP", driveMinutesFromSF: 90 },
  { source: "reservecalifornia", name: "Henry Cowell Redwoods SP", driveMinutesFromSF: 90 },
  { source: "reservecalifornia", name: "Butano SP", driveMinutesFromSF: 75 },
  { source: "reservecalifornia", name: "Portola Redwoods SP", driveMinutesFromSF: 75 },
  { source: "reservecalifornia", name: "Castle Rock SP", driveMinutesFromSF: 75 },
  { source: "reservecalifornia", name: "Half Moon Bay SB", driveMinutesFromSF: 45 },
  { source: "reservecalifornia", name: "New Brighton SB", driveMinutesFromSF: 90 },
  { source: "reservecalifornia", name: "Sunset SB", driveMinutesFromSF: 110 },
  { source: "reservecalifornia", name: "Manresa SB", driveMinutesFromSF: 110 },
  { source: "reservecalifornia", name: "Henry W. Coe SP", driveMinutesFromSF: 90 },
  { source: "reservecalifornia", name: "Pfeiffer Big Sur SP", driveMinutesFromSF: 150 },
];

// Verified via Recreation.gov /api/search 2026-05-13.
export const RECREATIONGOV_PARKS: RecreationGovPark[] = [
  { source: "recreationgov", name: "Kirby Cove Campground", campgroundId: "232491", driveMinutesFromSF: 20 },
  { source: "recreationgov", name: "Bicentennial Campground", campgroundId: "272229", driveMinutesFromSF: 25 },
  { source: "recreationgov", name: "Hawk Campground", campgroundId: "258815", driveMinutesFromSF: 30 },
  { source: "recreationgov", name: "Haypress Campground", campgroundId: "10067346", driveMinutesFromSF: 35 },
  { source: "recreationgov", name: "Rob Hill Group Campground (Presidio)", campgroundId: "10172170", driveMinutesFromSF: 15 },
  { source: "recreationgov", name: "Point Reyes National Seashore (Coast/Sky/Glen/Wildcat)", campgroundId: "233359", driveMinutesFromSF: 90 },
  { source: "recreationgov", name: "Pinnacles Campground", campgroundId: "234015", driveMinutesFromSF: 140 },
];

export const ALL_PARKS: Park[] = [...RESERVECALIFORNIA_PARKS, ...RECREATIONGOV_PARKS];
