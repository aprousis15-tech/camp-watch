export type RatingBasis = "stars" | "pct";

// A search-result card with parsed metadata. Used by both the notifier
// (only `qualifies: true` ones become Openings) and the site generator
// (shows everything, sorted by score).
export type Candidate = {
  slug: string;
  title: string;
  locationText: string | null;
  priceText: string | null;
  ratingValue: number | null;
  ratingBasis: RatingBasis | null;
  reviews: number | null;
  starHost: boolean;
  imageUrl: string | null;
  url: string;
  score: number;
  qualifies: boolean;
};

export type Opening = {
  tripId: "A" | "B";
  tripLabel: string;
  listingName: string;
  slug: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  url: string;
  rating: number | null;
  ratingBasis: RatingBasis | null;
  reviews: number | null;
  starHost: boolean;
  priceText: string | null;
  locationText: string | null;
  score: number;
  dedupeKey: string;
};
