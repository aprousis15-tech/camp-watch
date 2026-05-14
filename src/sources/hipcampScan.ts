import { chromium, type Browser, type Page } from "playwright";
import { USER_AGENT } from "../config.ts";
import { ADULTS, TRIPS, type Trip } from "../trips.ts";
import type { Opening, Candidate } from "../types.ts";

// Quality bar (matches the profile of the artifact's top picks).
const MIN_RATING_PCT = 95; // Hipcamp expresses ratings as % recommended OR stars
const MIN_RATING_STARS = 4.75; // alt threshold if rating exposed as stars
const MIN_REVIEWS = 50;

// Hipcamp's bbox param doesn't reliably filter results on the static search
// page — direct page loads tend to return featured/SEO listings from across
// the US. We hit the California state-level discover page instead, then
// apply a hard slug-prefix filter as the final guardrail.
function searchUrl(trip: Trip): string {
  const p = new URLSearchParams({
    adults: String(ADULTS),
    arrive: trip.checkIn,
    depart: trip.checkOut,
    accommodation_types: "tent",
  });
  return `https://www.hipcamp.com/en-US/california?${p.toString()}`;
}

// Heuristic: Hipcamp listing slugs are "<state>-<name-slug>-<6-12-char-id>".
// "california-timber-cove-mxvhkp6n" -> "Timber Cove".
function nameFromSlug(slug: string): string {
  return slug
    .replace(/^[a-z]+-/, "")
    .replace(/-[a-z0-9]{6,16}$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// California-only — drops Indiana/Wisconsin/Michigan/Maryland/Virginia/etc.
// featured listings that Hipcamp injects on the discover page.
function isCalifornia(slug: string): boolean {
  return slug.startsWith("california-");
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

        // Walk up until we find a card-like container.
        let card: HTMLElement = a;
        for (let i = 0; i < 5 && card.parentElement; i++) {
          card = card.parentElement as HTMLElement;
          const text = (card.innerText || "").trim();
          if (text.length > 40) break;
        }
        const text = (card.innerText || "").replace(/\s+/g, " ").trim();

        const starMatch = text.match(/(?:★|☆|⭐)\s*([0-9]\.[0-9]{1,2})/);
        const pctMatch = text.match(/\b(\d{2,3})\s*%\s*(?:recommended|of guests|positive)?/i);
        const ratingText = starMatch?.[0] ?? pctMatch?.[0] ?? null;

        const revMatch = text.match(/\((\d{1,4})\)|\b(\d{2,4})\s+reviews?\b/i);
        const reviewsText = revMatch?.[0] ?? null;

        const priceMatch = text.match(/\$\s?\d{1,4}[\s\w]*?\/?\s?(?:night|nt)?/i);
        const priceText = priceMatch?.[0] ?? null;

        const starHost = /\bstar host\b/i.test(text);

        // Title intentionally blank — caller derives from slug (more reliable
        // than walking Hipcamp's deeply-nested card DOM, which produced
        // mangled "99%(738)Tranquil Acres3 sites..." strings before).
        const img = card.querySelector("img");
        const imageUrl = img?.getAttribute("src") || img?.getAttribute("data-src") || null;

        out.push({
          slug,
          title: "",
          locationText: null,
          priceText,
          ratingText,
          reviewsText,
          starHost,
          imageUrl,
        });
      }
      return out;
    });

    // Hard filter: California-only slugs. Hipcamp's discover page injects
    // featured listings from other states (Indiana, Wisconsin, Virginia, etc.)
    // — slug prefix is the only reliable geography signal we have.
    return cards
      .filter((c) => isCalifornia(c.slug))
      .map((c) => ({ ...c, title: nameFromSlug(c.slug) }));
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

// Per-listing availability check. Discover-page results are NOT date-filtered
// (Hipcamp returns popular listings regardless of arrive/depart params), so we
// hit each listing's detail page with the trip dates and read the booking
// widget. False positives ("alert fires but listing isn't actually bookable")
// are preferred over false negatives ("miss the opening") — so we keep
// borderline-ambiguous pages.
async function isBookableForDates(
  browser: Browser,
  slug: string,
  trip: Trip,
): Promise<{ available: boolean; reason: string }> {
  const url = `https://www.hipcamp.com/en-US/land/${slug}?arrive=${trip.checkIn}&depart=${trip.checkOut}&adults=${ADULTS}`;
  const ctx = await browser.newContext({ userAgent: USER_AGENT });
  const page: Page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Wait for the booking widget GraphQL call to settle. Hipcamp fetches
    // availability via XHR after page hydration; networkidle is a much more
    // reliable signal than a fixed timeout.
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => null);
    // Even with networkidle, the React state may take another beat to render.
    await page.waitForTimeout(2000);

    const nightsRe = new RegExp(`\\u00d7\\s*${trip.nights}\\s+nights?`, "i"); // "× 3 nights"

    const signals = await page.evaluate(({ nightsPattern }) => {
      const text = document.body.innerText;
      const lower = text.toLowerCase();

      const cta = Array.from(document.querySelectorAll("button, a")).find((el) => {
        const t = (el.textContent || "").trim().toLowerCase();
        return /^(reserve|book( now)?|request to book|instant book)$/i.test(t);
      }) as HTMLButtonElement | null;

      const unavailable =
        lower.includes("not available for these dates") ||
        lower.includes("dates aren't available") ||
        lower.includes("dates unavailable") ||
        lower.includes("no availability for") ||
        lower.includes("select different dates") ||
        lower.includes("sold out");

      // "× 3 nights" appears in the booking widget total breakdown only when
      // the requested range is bookable. Strongest positive signal.
      const re = new RegExp(nightsPattern, "i");
      const nightsBreakdown = re.test(text);

      return {
        unavailable,
        nightsBreakdown,
        ctaText: cta?.textContent?.trim() ?? null,
        ctaDisabled: cta ? cta.hasAttribute("disabled") || cta.getAttribute("aria-disabled") === "true" : null,
      };
    }, { nightsPattern: nightsRe.source });

    // Tier 1 (strongest): explicit "× N nights" total breakdown.
    if (signals.nightsBreakdown) {
      return { available: true, reason: `total breakdown shows ${trip.nights} nights` };
    }
    // Tier 2 (negative): explicit unavailable copy beats CTA presence.
    if (signals.unavailable) {
      return { available: false, reason: "page shows unavailable copy" };
    }
    // Tier 3 (negative): disabled CTA.
    if (signals.ctaDisabled === true) {
      return { available: false, reason: "reserve CTA disabled" };
    }
    // Tier 4 (looser positive, per user choice "a"): an enabled Reserve/Book
    // CTA without negative signals is treated as bookable. Hipcamp renders
    // this CTA by default so this matches ~50% false positives — accepted
    // tradeoff to surface more candidates rather than miss real openings.
    if (signals.ctaText) {
      return { available: true, reason: `CTA enabled: ${signals.ctaText} (unverified, click to confirm)` };
    }
    // No signals at all — exclude (can't even find a booking widget).
    return { available: false, reason: "no booking widget detected" };
  } finally {
    await ctx.close().catch(() => {});
  }
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

      candidates.sort((a, b) => b.score - a.score);
      const preVerify = candidates.filter((c) => c.qualifies);
      console.log(`  passed quality bar (pre-verify): ${preVerify.length}`);

      // Per-listing availability verification. Discover-page hits don't
      // actually filter by date — only this step does.
      let verified = 0;
      for (const c of preVerify) {
        try {
          const r = await isBookableForDates(browser, c.slug, trip);
          if (!r.available) {
            c.qualifies = false;
            console.log(`    · ${c.title}: skip (${r.reason})`);
          } else {
            verified++;
            console.log(`    ✓ ${c.title}: ${r.reason}`);
          }
        } catch (e) {
          // On error, keep it (false-positive bias).
          console.warn(`    ! ${c.title}: verify failed (${(e as Error).message}); keeping`);
        }
      }
      console.log(`  actually bookable: ${verified}`);
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
