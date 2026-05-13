import { RESERVECALIFORNIA_PARKS, RECREATIONGOV_PARKS } from "./parks.ts";
import { checkReserveCalifornia } from "./sources/reservecalifornia.ts";
import { checkRecreationGov } from "./sources/recreationgov.ts";
import { checkHipcamp } from "./sources/hipcamp.ts";
import { loadState, saveState, filterNew, pruneOld } from "./state.ts";
import { notify } from "./notify.ts";
import type { Opening } from "./types.ts";

type CheckResult = {
  label: string;
  openings: Opening[];
  error?: string;
};

async function runAll(): Promise<CheckResult[]> {
  const tasks: Array<Promise<CheckResult>> = [];

  for (const park of RESERVECALIFORNIA_PARKS) {
    tasks.push(
      checkReserveCalifornia(park)
        .then((openings) => ({ label: `RC: ${park.name}`, openings }))
        .catch((e: Error) => ({ label: `RC: ${park.name}`, openings: [], error: e.message })),
    );
  }
  for (const park of RECREATIONGOV_PARKS) {
    tasks.push(
      checkRecreationGov(park)
        .then((openings) => ({ label: `RG: ${park.name}`, openings }))
        .catch((e: Error) => ({ label: `RG: ${park.name}`, openings: [], error: e.message })),
    );
  }

  tasks.push(
    checkHipcamp()
      .then((openings) => ({ label: "HC: bbox ~2.5h SF", openings }))
      .catch((e: Error) => ({ label: "HC: bbox ~2.5h SF", openings: [], error: e.message })),
  );

  return Promise.all(tasks);
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`camp-watch run @ ${new Date().toISOString()}`);

  const results = await runAll();

  let okCount = 0;
  let errCount = 0;
  const allOpenings: Opening[] = [];
  for (const r of results) {
    if (r.error) {
      errCount++;
      console.warn(`  [err] ${r.label}: ${r.error}`);
    } else {
      okCount++;
      if (r.openings.length > 0) {
        console.log(`  [hit] ${r.label}: ${r.openings.length} opening(s)`);
        allOpenings.push(...r.openings);
      }
    }
  }
  console.log(`Sources: ${okCount} ok, ${errCount} failed. Total openings: ${allOpenings.length}`);

  const state = await loadState();
  pruneOld(state);
  const fresh = filterNew(state, allOpenings);
  console.log(`New since last run: ${fresh.length}`);

  if (fresh.length > 0) {
    await notify(fresh);
  }

  await saveState(state);
  console.log(`Done in ${Date.now() - startedAt}ms`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
