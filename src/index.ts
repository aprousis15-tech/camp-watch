import { scanAllTrips, toOpenings } from "./sources/hipcampScan.ts";
import { buildSite } from "./site/build.ts";
import { loadState, saveState, filterNew, pruneOld } from "./state.ts";
import { notify } from "./notify.ts";

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`camp-watch run @ ${new Date().toISOString()}`);

  const results = await scanAllTrips();
  const allOpenings = toOpenings(results);

  // Build the dashboard regardless of new findings.
  await buildSite(results);
  console.log(`Built docs/index.html (${results.reduce((n, r) => n + r.candidates.length, 0)} cards rendered)`);

  // Dedupe-aware notifier: only emails on first observation.
  allOpenings.sort((a, b) => {
    if (a.tripId !== b.tripId) return a.tripId === "A" ? -1 : 1;
    return b.score - a.score;
  });

  const state = await loadState();
  pruneOld(state);
  const fresh = filterNew(state, allOpenings);
  console.log(`Qualifying: ${allOpenings.length} · new this run: ${fresh.length}`);

  if (fresh.length > 0) {
    await notify(fresh);
  }

  await saveState(state);
  console.log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
