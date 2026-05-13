import { chromium, type Browser, type Page } from "playwright";
import { USER_AGENT } from "../config.ts";
import { ALL_LISTINGS, type Listing } from "../listings.ts";
import { TRIPS, ADULTS, tripById, type Trip } from "../trips.ts";
import { resolveSlugsForAll } from "../resolveSlugs.ts";
import type { Opening } from "../types.ts";

function buildListingUrl(slug: string, trip: Trip): string {
  const params = new URLSearchParams({
    arrive: trip.checkIn,
    depart: trip.checkOut,
    adults: String(ADULTS),
  });
  return `https://www.hipcamp.com/en-US/land/${slug}?${params.toString()}`;
}

// Looks at a freshly-loaded listing page and decides whether the requested
// arrive/depart range is bookable. Hipcamp's UI varies by listing — multiple
// sites within one property, group bookings, instant-book vs request, etc. —
// so we rely on a small set of textual signals plus the presence of an
// enabled CTA. False positives ("alert is sent but listing isn't actually
// bookable") are preferable to false negatives ("we miss the opening").
async function checkAvailability(page: Page): Promise<{ available: boolean; reason: string }> {
  // Give the booking widget time to hydrate.
  await page
    .waitForSelector('button:has-text("Reserve"), button:has-text("Book"), button:has-text("Request"), [data-testid*="book"], text=/not available/i, text=/sold out/i', {
      timeout: 12000,
    })
    .catch(() => null);
  await page.waitForTimeout(1500);

  const signals = await page.evaluate(() => {
    const text = document.body.innerText.toLowerCase();
    const cta = Array.from(document.querySelectorAll("button, a")).find((el) => {
      const t = (el.textContent || "").trim().toLowerCase();
      return /^(reserve|book( now)?|request to book|instant book)$/i.test(t);
    }) as HTMLButtonElement | null;
    return {
      hasUnavailable:
        text.includes("not available for these dates") ||
        text.includes("dates aren't available") ||
        text.includes("sold out") ||
        text.includes("dates unavailable") ||
        text.includes("no availability"),
      ctaText: cta?.textContent?.trim() ?? null,
      ctaDisabled: cta ? cta.hasAttribute("disabled") || cta.getAttribute("aria-disabled") === "true" : null,
    };
  });

  if (signals.hasUnavailable && !signals.ctaText) {
    return { available: false, reason: "page shows unavailable, no reserve CTA" };
  }
  if (signals.ctaText && signals.ctaDisabled !== true) {
    return { available: true, reason: `CTA: ${signals.ctaText}` };
  }
  if (signals.ctaText && signals.ctaDisabled === true) {
    return { available: false, reason: "reserve CTA disabled" };
  }
  return { available: false, reason: "no clear signal" };
}

async function checkOne(
  browser: Browser,
  listing: Listing,
  trip: Trip,
  slug: string,
): Promise<Opening | null> {
  const ctx = await browser.newContext({ userAgent: USER_AGENT });
  const page = await ctx.newPage();
  try {
    const url = buildListingUrl(slug, trip);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const result = await checkAvailability(page);
    if (!result.available) {
      console.log(`  · [${trip.id}/${listing.rank}] ${listing.name}: unavailable (${result.reason})`);
      return null;
    }
    console.log(`  ✓ [${trip.id}/${listing.rank}] ${listing.name}: ${result.reason}`);
    return {
      tripId: trip.id,
      tripLabel: trip.label,
      rank: listing.rank,
      tier: listing.tier,
      listingName: listing.name,
      checkIn: trip.checkIn,
      checkOut: trip.checkOut,
      nights: trip.nights,
      url,
      dedupeKey: `hc:${slug}:${trip.id}:${trip.checkIn}:${trip.checkOut}`,
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function checkAllHipcamp(): Promise<Opening[]> {
  const slugs = await resolveSlugsForAll();
  const browser = await chromium.launch({ headless: true });
  const openings: Opening[] = [];

  try {
    for (const listing of ALL_LISTINGS) {
      const slug = slugs.get(listing.name);
      if (!slug) {
        console.warn(`  ! ${listing.name}: no slug resolved, skipping`);
        continue;
      }
      const trip = tripById(listing.trip);
      try {
        const op = await checkOne(browser, listing, trip, slug);
        if (op) openings.push(op);
      } catch (e) {
        console.warn(`  ! ${listing.name} (${trip.id}): ${(e as Error).message}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return openings;
}

// Touch TRIPS to avoid "unused import" — listings already encode trip ids.
void TRIPS;
