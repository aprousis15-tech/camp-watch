import { checkAllHipcamp } from "./sources/hipcamp.ts";
import { loadState, saveState, filterNew, pruneOld } from "./state.ts";
import { notify } from "./notify.ts";

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`camp-watch run @ ${new Date().toISOString()}`);

  const openings = await checkAllHipcamp();

  // Sort by trip then rank so the email reads top-down by preference.
  openings.sort((a, b) => {
    if (a.tripId !== b.tripId) return a.tripId === "A" ? -1 : 1;
    return a.rank - b.rank;
  });

  console.log(`Total bookable now: ${openings.length}`);

  const state = await loadState();
  pruneOld(state);
  const fresh = filterNew(state, openings);
  console.log(`New since last run: ${fresh.length}`);

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
