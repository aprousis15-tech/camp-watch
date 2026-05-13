import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import { USER_AGENT } from "./config.ts";
import { ALL_LISTINGS, type Listing } from "./listings.ts";

const SLUGS_PATH = resolve(process.cwd(), "slugs.json");

type SlugFile = Record<string, string>; // listingName -> slug

async function loadSlugs(): Promise<SlugFile> {
  try {
    return JSON.parse(await readFile(SLUGS_PATH, "utf8")) as SlugFile;
  } catch {
    return {};
  }
}

async function saveSlugs(slugs: SlugFile): Promise<void> {
  await writeFile(SLUGS_PATH, JSON.stringify(slugs, null, 2) + "\n", "utf8");
}

// Use Hipcamp's homepage search input. Type the query, wait for suggestions
// or for the search results page, then extract the first /en-US/land/ link.
async function resolveOne(browser: Browser, listing: Listing): Promise<string | null> {
  const ctx = await browser.newContext({ userAgent: USER_AGENT });
  const page = await ctx.newPage();
  try {
    await page.goto("https://www.hipcamp.com/en-US", { waitUntil: "domcontentloaded", timeout: 30000 });

    // Type into the global search input. Hipcamp uses a place autocomplete; we
    // can also just hit /search?bbox=... but search-by-name is simpler if it works.
    // Strategy: navigate directly to the search page with the location hint as
    // a place query, then look for the listing by name in the results.
    const q = encodeURIComponent(`${listing.searchQuery} ${listing.locationHint}`);
    await page.goto(`https://www.hipcamp.com/en-US/search?q=${q}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3500);

    // Grab all land URLs, score by name overlap.
    const candidates = await page.evaluate(() => {
      const out: { href: string; text: string }[] = [];
      const seen = new Set<string>();
      document
        .querySelectorAll<HTMLAnchorElement>('a[href*="/en-US/land/"]')
        .forEach((a) => {
          const href = a.getAttribute("href") || "";
          const slug = href.split("?")[0].split("/").pop() || "";
          if (!slug || seen.has(slug)) return;
          seen.add(slug);
          out.push({ href, text: (a.textContent || "").trim().slice(0, 300) });
        });
      return out;
    });

    if (candidates.length === 0) return null;

    // Score by token overlap with the listing's name + hint.
    const norm = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((w) => w.length > 2);
    const queryTokens = new Set([...norm(listing.name), ...norm(listing.locationHint)]);

    const scored = candidates
      .map((c) => {
        const slug = c.href.split("?")[0].split("/").pop() || "";
        const slugTokens = norm(slug.replace(/-/g, " "));
        const textTokens = norm(c.text);
        let score = 0;
        for (const t of slugTokens) if (queryTokens.has(t)) score += 2;
        for (const t of textTokens) if (queryTokens.has(t)) score += 1;
        return { slug, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    return best && best.score > 0 ? best.slug : null;
  } finally {
    await ctx.close().catch(() => {});
  }
}

// Resolves slugs for any listing that doesn't have one cached. Idempotent.
export async function resolveSlugsForAll(): Promise<Map<string, string>> {
  const cached = await loadSlugs();
  const resolved = new Map<string, string>(Object.entries(cached));
  const todo = ALL_LISTINGS.filter((l) => !resolved.has(l.name));

  if (todo.length === 0) return resolved;

  console.log(`Resolving ${todo.length} listing slug(s)...`);
  const browser = await chromium.launch({ headless: true });
  try {
    for (const listing of todo) {
      try {
        const slug = await resolveOne(browser, listing);
        if (slug) {
          resolved.set(listing.name, slug);
          console.log(`  ✓ ${listing.name} → ${slug}`);
        } else {
          console.warn(`  ✗ ${listing.name}: no slug found`);
        }
      } catch (e) {
        console.warn(`  ✗ ${listing.name}: ${(e as Error).message}`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  // Persist whatever we resolved (additions only — never delete existing).
  const merged: SlugFile = { ...cached };
  for (const [k, v] of resolved) merged[k] = v;
  await saveSlugs(merged);

  return resolved;
}

// Standalone CLI: `tsx src/resolveSlugs.ts` to (re-)resolve manually.
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  resolveSlugsForAll().then(() => process.exit(0));
}
