import { scanAllTrips, toOpenings, type ScanResult } from "./sources/hipcampScan.ts";
import { TRIPS } from "./trips.ts";
import { buildSite } from "./site/build.ts";
import { loadState, saveState, filterNew, pruneOld } from "./state.ts";
import { notify } from "./notify.ts";

function emptyScanResults(): ScanResult[] {
  return TRIPS.map((trip) => ({ trip, candidates: [] }));
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`camp-watch run @ ${new Date().toISOString()}`);

  // Scrape — but never let a Hipcamp / Playwright failure stop the deploy.
  // We still want docs/ to be regenerated (even if to "no results right now")
  // so the dashboard shows a fresh timestamp and the Pages deploy proceeds.
  let results: ScanResult[];
  try {
    results = await scanAllTrips();
  } catch (e) {
    console.error("Hipcamp scan failed:", e);
    results = emptyScanResults();
  }

  try {
    await buildSite(results);
    console.log(
      `Built docs/index.html (${results.reduce((n, r) => n + r.candidates.length, 0)} cards rendered)`,
    );
  } catch (e) {
    console.error("Site build failed:", e);
  }

  // Notifications: only fire when we actually found new qualifying listings.
  try {
    const openings = toOpenings(results);
    openings.sort((a, b) => {
      if (a.tripId !== b.tripId) return a.tripId === "A" ? -1 : 1;
      return b.score - a.score;
    });

    const state = await loadState();
    pruneOld(state);
    const fresh = filterNew(state, openings);
    console.log(`Qualifying: ${openings.length} · new this run: ${fresh.length}`);
    if (fresh.length > 0) await notify(fresh);
    await saveState(state);
  } catch (e) {
    console.error("Notify/state phase failed:", e);
  }

  console.log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // Last-resort: still exit 0 so the deploy step runs. Failures already
    // logged above; the workflow's `continue-on-error: true` covers this too.
    console.error("Top-level fatal:", e);
    process.exit(0);
  });
