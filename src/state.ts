import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Opening } from "./types.ts";

const STATE_PATH = resolve(process.cwd(), "state.json");

type StateFile = {
  // dedupeKey -> ISO timestamp of when we first notified for this key
  notified: Record<string, string>;
};

export async function loadState(): Promise<StateFile> {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    return JSON.parse(raw) as StateFile;
  } catch {
    return { notified: {} };
  }
}

export async function saveState(state: StateFile): Promise<void> {
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

// Returns only openings we haven't notified about yet, and mutates state so
// the caller can persist it.
export function filterNew(state: StateFile, openings: Opening[]): Opening[] {
  const fresh: Opening[] = [];
  const now = new Date().toISOString();
  for (const op of openings) {
    if (state.notified[op.dedupeKey]) continue;
    state.notified[op.dedupeKey] = now;
    fresh.push(op);
  }
  return fresh;
}

// Drop notified entries older than 14 days so a re-opened-then-closed-then-reopened
// site can alert again. Memorial Day weekend will pass, so cleanup keeps state small.
export function pruneOld(state: StateFile, maxAgeMs = 14 * 24 * 60 * 60 * 1000): void {
  const cutoff = Date.now() - maxAgeMs;
  for (const [key, iso] of Object.entries(state.notified)) {
    if (new Date(iso).getTime() < cutoff) delete state.notified[key];
  }
}
