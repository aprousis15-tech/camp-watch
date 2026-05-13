export const TRIP = {
  checkIn: "2026-05-22",
  checkOut: "2026-05-24",
  nights: 2,
  minPeople: 3,
  maxPeople: 6,
  equipment: "tent" as const,
};

export const DRY_RUN = !!process.env.DRY_RUN;

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
