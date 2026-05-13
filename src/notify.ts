import { fetch } from "undici";
import { DRY_RUN } from "./config.ts";
import type { Opening } from "./types.ts";

function escapeMd(s: string): string {
  return s.replace(/([\\`*_{}[\]()#+\-.!|])/g, "\\$1");
}

function tripHeader(tripId: "A" | "B", tripLabel: string, items: Opening[]): string {
  const dateRange = items[0] ? `${items[0].checkIn} → ${items[0].checkOut}` : "";
  const lines = [
    `### Trip ${tripId} — ${escapeMd(tripLabel)} (${dateRange})`,
    "",
    "| Rank | Tier | Listing | Link |",
    "|---|---|---|---|",
  ];
  for (const o of items) {
    lines.push(
      `| #${o.rank} | ${o.tier} | ${escapeMd(o.listingName)} | [Reserve](${o.url}) |`,
    );
  }
  return lines.join("\n");
}

function renderBody(openings: Opening[]): string {
  const byTrip = new Map<"A" | "B", Opening[]>();
  for (const o of openings) {
    if (!byTrip.has(o.tripId)) byTrip.set(o.tripId, []);
    byTrip.get(o.tripId)!.push(o);
  }
  const sections: string[] = [
    `**${openings.length} new opening${openings.length === 1 ? "" : "s"}** — book fast, these vanish.`,
    "",
  ];
  for (const [tripId, items] of byTrip) {
    sections.push(tripHeader(tripId, items[0].tripLabel, items));
    sections.push("");
  }
  sections.push("_camp-watch · ranking is from the MDW two-trips brief._");
  return sections.join("\n");
}

function renderTitle(openings: Opening[]): string {
  // Lead with the best-ranked opening so the email subject is informative.
  const top = openings.reduce((best, o) => {
    if (!best) return o;
    if (o.tripId < best.tripId) return o;
    if (o.tripId === best.tripId && o.rank < best.rank) return o;
    return best;
  }, null as Opening | null)!;
  const others = openings.length - 1;
  const suffix = others > 0 ? ` (+${others} more)` : "";
  return `[camp-watch] #${top.rank} ${top.listingName} open for Trip ${top.tripId}${suffix}`;
}

export async function notify(openings: Opening[]): Promise<void> {
  if (openings.length === 0) return;

  const title = renderTitle(openings);
  const body = renderBody(openings);

  if (DRY_RUN) {
    console.log("[DRY_RUN] would open GitHub issue:");
    console.log(`  title: ${title}`);
    console.log(body);
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    console.error("GITHUB_TOKEN / GITHUB_REPOSITORY not set — printing instead:");
    console.error(title);
    console.error(body);
    return;
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "camp-watch",
    },
    body: JSON.stringify({ title, body, labels: ["opening"] }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub issue create failed: ${res.status} ${text}`);
  }
  const j = (await res.json()) as { html_url?: string; number?: number };
  console.log(`Opened issue #${j.number}: ${j.html_url}`);
}
