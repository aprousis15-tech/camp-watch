export type Trip = {
  id: "A" | "B";
  label: string;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;  // YYYY-MM-DD
  nights: number;
};

export const TRIPS: Trip[] = [
  {
    id: "A",
    label: "MDW",
    checkIn: "2026-05-22",
    checkOut: "2026-05-24",
    nights: 2,
  },
  {
    id: "B",
    label: "Weekend after MDW",
    checkIn: "2026-05-29",
    checkOut: "2026-05-31",
    nights: 2,
  },
];

export const ADULTS = 4;

export function tripById(id: "A" | "B"): Trip {
  const t = TRIPS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown trip ${id}`);
  return t;
}
