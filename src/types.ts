export type Opening = {
  source: "reservecalifornia" | "recreationgov" | "hipcamp";
  parkName: string;
  siteName: string;
  // ISO check-in / check-out
  checkIn: string;
  checkOut: string;
  // Direct booking URL
  url: string;
  // Stable key for dedupe — same site+dates should produce same key.
  dedupeKey: string;
};
