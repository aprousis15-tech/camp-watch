import { fetch } from "undici";
import { DRY_RUN } from "./config.ts";
import type { Opening } from "./types.ts";

function escapeMd(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/([\\`*_{}[\]()#+\-.!|])/g, "\\$1");
}

function renderRating(o: Opening): string {
  if (o.rating == null) return "—";
  if (o.ratingBasis === "stars") return `★ ${o.rating.toFixed(2)}`;
  return `${o.rating}%`;
}

function renderRow(o: Opening): string {
  const host = o.starHost ? "⭐ Star Host" : "";
  return `| ${escapeMd(o.listingName)} | ${escapeMd(o.locationText)} | ${renderRating(o)} | ${o.reviews ?? "—"} | ${host} | ${escapeMd(o.priceText)} | [Reserve](${o.url}) |`;
}

function tripBlock(tripId: "A" | "B", items: Opening[]): string {
  const dateRange = `${items[0].checkIn} → ${items[0].checkOut}`;
  return [
    `### Trip ${tripId} — ${escapeMd(items[0].tripLabel)} (${dateRange})`,
    "",
    "| Listing | Location | Rating | Reviews | Host | Price | Book |",
    "|---|---|---|---|---|---|---|",
    ...items.map(renderRow),
  ].join("\n");
}

function renderBody(openings: Opening[]): string {
  const byTrip = new Map<"A" | "B", Opening[]>();
  for (const o of openings) {
    if (!byTrip.has(o.tripId)) byTrip.set(o.tripId, []);
    byTrip.get(o.tripId)!.push(o);
  }
  const parts: string[] = [
    `**${openings.length} new qualifying opening${openings.length === 1 ? "" : "s"}** matching the profile (≥95% rating, ≥50 reviews).`,
    "",
    "Live dashboard: [aprousis15-tech.github.io/camp-watch](https://aprousis15-tech.github.io/camp-watch/)",
    "",
  ];
  for (const [tripId, items] of byTrip) {
    parts.push(tripBlock(tripId, items));
    parts.push("");
  }
  parts.push("_camp-watch · book fast, MDW spots vanish in minutes._");
  return parts.join("\n");
}

function renderTitle(openings: Opening[]): string {
  const top = openings.reduce((best, o) => (!best || o.score > best.score ? o : best), null as Opening | null)!;
  const suffix = openings.length > 1 ? ` (+${openings.length - 1} more)` : "";
  return `[camp-watch] ${top.listingName} open for Trip ${top.tripId}${suffix}`;
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
