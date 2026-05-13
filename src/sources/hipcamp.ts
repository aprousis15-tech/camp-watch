import { chromium, type Browser } from "playwright";
import { TRIP, USER_AGENT } from "../config.ts";
import type { Opening } from "../types.ts";

// Hipcamp is fully client-rendered, so we drive a headless Chromium to load
// the search page and scrape rendered DOM. Slower (~10s per run) but reliable.

// Bounding box: [west, south, east, north] covering ~2.5h of SF
// (north of Mendocino-ish down to Big Sur, east to Sierra foothills).
const BBOX: [number, number, number, number] = [-123.8, 36.2, -120.5, 39.3];

function buildSearchUrl(): string {
  const [w, s, e, n] = BBOX;
  const params = new URLSearchParams({
    bbox: `${w},${s},${e},${n}`,
    adults: String(TRIP.maxPeople),
    arrive: TRIP.checkIn,
    depart: TRIP.checkOut,
    accommodation_types: "tent",
  });
  return `https://www.hipcamp.com/en-US/search?${params.toString()}`;
}

export async function checkHipcamp(): Promise<Opening[]> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: USER_AGENT });
    const page = await ctx.newPage();
    const url = buildSearchUrl();

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for at least one listing link to appear, or for an explicit
    // empty-state. 15s budget is generous; if Hipcamp's selectors change
    // we want to fail-fast rather than hang.
    await page
      .waitForSelector('a[href^="/en-US/land/"], [data-testid="search-empty"]', {
        timeout: 15000,
      })
      .catch(() => null);

    // Give lazy-loaded cards a moment to settle.
    await page.waitForTimeout(2000);

    const listings = await page.evaluate(() => {
      const anchors = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href^="/en-US/land/"]'),
      );
      const seen = new Set<string>();
      const out: { href: string; title: string }[] = [];
      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        const slug = href.split("?")[0].replace(/^\/en-US\/land\//, "").replace(/\/$/, "");
        if (!slug || seen.has(slug)) continue;
        // Pull a human-readable title from inside the card.
        const title =
          a.querySelector("h2, h3, [class*='title' i]")?.textContent?.trim() ||
          a.getAttribute("aria-label")?.trim() ||
          a.textContent?.trim().split("\n")[0] ||
          slug;
        seen.add(slug);
        out.push({ href, title });
      }
      return out;
    });

    const openings: Opening[] = listings.map((l) => {
      const slug = l.href.split("?")[0].replace(/^\/en-US\/land\//, "").replace(/\/$/, "");
      const bookingUrl = `https://www.hipcamp.com/en-US/land/${slug}?arrive=${TRIP.checkIn}&depart=${TRIP.checkOut}&adults=${TRIP.maxPeople}`;
      return {
        source: "hipcamp",
        parkName: "Hipcamp",
        siteName: l.title,
        checkIn: TRIP.checkIn,
        checkOut: TRIP.checkOut,
        url: bookingUrl,
        dedupeKey: `hc:${slug}:${TRIP.checkIn}:${TRIP.checkOut}`,
      };
    });

    return openings;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
