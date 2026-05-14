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

  // Scan — failures don't stop the pipeline; we still want a fresh deploy.
  let results: ScanResult[];
  try {
    results = await scanAllTrips();
  } catch (e) {
    console.error("Hipcamp scan failed:", e);
    results = emptyScanResults();
  }

  // State + dedupe must update BEFORE rendering the site, so the dashboard's
  // "Recently added" timeline reflects this run's discoveries.
  const state = await loadState();
  pruneOld(state);

  const openings = toOpenings(results);
  openings.sort((a, b) => {
    if (a.tripId !== b.tripId) return a.tripId === "A" ? -1 : 1;
    return b.score - a.score;
  });
  const fresh = filterNew(state, openings); // mutates state with first-seen timestamps
  console.log(`Verified-bookable: ${openings.length} · new this run: ${fresh.length}`);
  await saveState(state);

  // Build dashboard with both the current scan and the historical first-seen
  // timestamps from state.
  try {
    await buildSite(results, state);
    console.log("Built docs/index.html");
  } catch (e) {
    console.error("Site build failed:", e);
  }

  // Notify only on fresh openings.
  try {
    if (fresh.length > 0) await notify(fresh);
  } catch (e) {
    console.error("Notify failed:", e);
  }

  console.log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Top-level fatal:", e);
    process.exit(0);
  });
