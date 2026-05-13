import { chromium, type Browser } from "playwright";
import { USER_AGENT } from "../config.ts";
import { ADULTS, TRIPS, type Trip } from "../trips.ts";
import type { Opening, Candidate } from "../types.ts";

// Bounding box covering ~2.5h drive of SF (Sonoma → Big Sur → Sierra foothills).
const BBOX: [number, number, number, number] = [-123.8, 36.2, -120.5, 39.3];

// Quality bar (matches the profile of the artifact's top picks).
const MIN_RATING_PCT = 95; // Hipcamp expresses ratings as % recommended OR stars
const MIN_RATING_STARS = 4.75; // alt threshold if rating exposed as stars
const MIN_REVIEWS = 50;

function searchUrl(trip: Trip): string {
  const [w, s, e, n] = BBOX;
  const p = new URLSearchParams({
    bbox: `${w},${s},${e},${n}`,
    adults: String(ADULTS),
    arrive: trip.checkIn,
    depart: trip.checkOut,
    accommodation_types: "tent",
  });
  return `https://www.hipcamp.com/en-US/search?${p.toString()}`;
}

type RawCard = {
  slug: string;
  title: string;
  locationText: string | null;
  priceText: string | null;
  ratingText: string | null;
  reviewsText: string | null;
  starHost: boolean;
  imageUrl: string | null;
};

async function scrapeCards(browser: Browser, trip: Trip): Promise<RawCard[]> {
  const ctx = await browser.newContext({ userAgent: USER_AGENT });
  const page = await ctx.newPage();
  try {
    await page.goto(searchUrl(trip), { waitUntil: "domcontentloaded", timeout: 30000 });
    // Wait for search results to render. Use a defensive selector set since
    // Hipcamp's class names change.
    await page
      .waitForSelector('a[href^="/en-US/land/"], [data-testid*="search"]', { timeout: 20000 })
      .catch(() => null);
    await page.waitForTimeout(3000);

    // Lazy-load: scroll a couple times so all cards render.
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await page.waitForTimeout(1000);
    }

    const cards = await page.evaluate(() => {
      const anchors = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href^="/en-US/land/"]'),
      );
      const seen = new Set<string>();
      const out: RawCard[] = [];
      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        const slug = href.split("?")[0].replace(/^\/en-US\/land\//, "").replace(/\/$/, "");
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);

        // Walk up until we find a card-like container with the listing's metadata.
        let card: HTMLElement = a;
        for (let i = 0; i < 5 && card.parentElement; i++) {
          card = card.parentElement as HTMLElement;
          const text = (card.innerText || "").trim();
          if (text.length > 40) break;
        }
        const text = (card.innerText || "").replace(/\s+/g, " ").trim();

        const titleEl = card.querySelector("h2, h3, h4, [class*='title' i], [class*='name' i]");
        const title = (titleEl?.textContent || a.textContent || slug).trim().split("\n")[0];

        // Rating: looks like "★ 4.95" or "98%" — capture either form.
        const starMatch = text.match(/(?:★|☆|⭐)\s*([0-9]\.[0-9]{1,2})/);
        const pctMatch = text.match(/\b(\d{2,3})\s*%\s*(?:recommended|of guests|positive)?/i);
        const ratingText = starMatch?.[0] ?? pctMatch?.[0] ?? null;

        // Reviews: "(291)" or "291 reviews".
        const revMatch = text.match(/\((\d{1,4})\)|\b(\d{2,4})\s+reviews?\b/i);
        const reviewsText = revMatch?.[0] ?? null;

        // Price: "$85/night" / "From $85" / "$85 night"
        const priceMatch = text.match(/\$\s?\d{1,4}[\s\w]*?\/?\s?(?:night|nt)?/i);
        const priceText = priceMatch?.[0] ?? null;

        // Star Host: scan for the text or icon — Hipcamp has a "Star Host" badge.
        const starHost = /\bstar host\b/i.test(text);

        // Location: usually the second line of the card text, after the title.
        const lines = (card.innerText || "").split("\n").map((l) => l.trim()).filter(Boolean);
        const titleIdx = lines.findIndex((l) => l.startsWith(title));
        const locationText = titleIdx >= 0 && lines[titleIdx + 1] ? lines[titleIdx + 1] : null;

        const img = card.querySelector("img");
        const imageUrl = img?.getAttribute("src") || img?.getAttribute("data-src") || null;

        out.push({ slug, title, locationText, priceText, ratingText, reviewsText, starHost, imageUrl });
      }
      return out;
    });
    return cards;
  } finally {
    await ctx.close().catch(() => {});
  }
}

function parseRating(s: string | null): { value: number; basis: "stars" | "pct" } | null {
  if (!s) return null;
  const star = s.match(/([0-9]\.[0-9]{1,2})/);
  if (star) {
    const v = parseFloat(star[1]);
    if (v >= 1 && v <= 5) return { value: v, basis: "stars" };
  }
  const pct = s.match(/(\d{2,3})\s*%/);
  if (pct) {
    const v = parseInt(pct[1], 10);
    if (v >= 0 && v <= 100) return { value: v, basis: "pct" };
  }
  return null;
}

function parseReviews(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/(\d{1,4})/);
  return m ? parseInt(m[1], 10) : null;
}

function passesQualityBar(rating: ReturnType<typeof parseRating>, reviews: number | null): boolean {
  if (!rating) return false;
  if (rating.basis === "pct" && rating.value < MIN_RATING_PCT) return false;
  if (rating.basis === "stars" && rating.value < MIN_RATING_STARS) return false;
  if (reviews == null || reviews < MIN_REVIEWS) return false;
  return true;
}

// Higher = better. Used to sort the dashboard.
function score(
  rating: ReturnType<typeof parseRating>,
  reviews: number | null,
  starHost: boolean,
): number {
  if (!rating || reviews == null) return 0;
  const ratingNorm = rating.basis === "stars" ? (rating.value / 5) * 100 : rating.value;
  // log10(reviews+10) keeps the curve gentle — 50 reviews vs 500 isn't 10x better.
  const reviewWeight = Math.log10(reviews + 10);
  const hostBonus = starHost ? 1.05 : 1.0;
  return ratingNorm * reviewWeight * hostBonus;
}

export type ScanResult = {
  trip: Trip;
  candidates: Candidate[];
};

export async function scanAllTrips(): Promise<ScanResult[]> {
  const browser = await chromium.launch({ headless: true });
  const results: ScanResult[] = [];
  try {
    for (const trip of TRIPS) {
      console.log(`Scanning Hipcamp for Trip ${trip.id} (${trip.checkIn} → ${trip.checkOut})...`);
      const cards = await scrapeCards(browser, trip);
      console.log(`  raw results: ${cards.length}`);

      const candidates: Candidate[] = cards.map((c) => {
        const rating = parseRating(c.ratingText);
        const reviews = parseReviews(c.reviewsText);
        return {
          slug: c.slug,
          title: c.title,
          locationText: c.locationText,
          priceText: c.priceText,
          ratingValue: rating?.value ?? null,
          ratingBasis: rating?.basis ?? null,
          reviews: reviews,
          starHost: c.starHost,
          imageUrl: c.imageUrl,
          url: `https://www.hipcamp.com/en-US/land/${c.slug}?arrive=${trip.checkIn}&depart=${trip.checkOut}&adults=${ADULTS}`,
          score: score(rating, reviews, c.starHost),
          qualifies: passesQualityBar(rating, reviews),
        };
      });

      // Sort by score desc — qualifies-first ordering happens in the consumer.
      candidates.sort((a, b) => b.score - a.score);
      console.log(`  qualifying: ${candidates.filter((c) => c.qualifies).length}`);
      results.push({ trip, candidates });
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return results;
}

// Emit Opening records for new qualifying candidates (consumed by notifier).
export function toOpenings(results: ScanResult[]): Opening[] {
  const out: Opening[] = [];
  for (const { trip, candidates } of results) {
    for (const c of candidates) {
      if (!c.qualifies) continue;
      out.push({
        tripId: trip.id,
        tripLabel: trip.label,
        listingName: c.title,
        slug: c.slug,
        checkIn: trip.checkIn,
        checkOut: trip.checkOut,
        nights: trip.nights,
        url: c.url,
        rating: c.ratingValue,
        ratingBasis: c.ratingBasis,
        reviews: c.reviews,
        starHost: c.starHost,
        priceText: c.priceText,
        locationText: c.locationText,
        score: c.score,
        dedupeKey: `hc:${c.slug}:${trip.id}:${trip.checkIn}:${trip.checkOut}`,
      });
    }
  }
  return out;
}
