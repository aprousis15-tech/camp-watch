import { fetch } from "undici";
import { TRIP, DRY_RUN } from "./config.ts";
import type { Opening } from "./types.ts";

// We notify by opening a GitHub issue in the same repo. GitHub will email
// the repo owner (per your notification settings — default is "watching" on
// owned repos, which emails on every new issue). No API keys required —
// uses the GITHUB_TOKEN already provided to GitHub Actions.

function escapeMd(s: string): string {
  return s.replace(/([\\`*_{}[\]()#+\-.!|])/g, "\\$1");
}

function renderBody(openings: Opening[]): string {
  const lines = [
    `**${openings.length} new opening${openings.length === 1 ? "" : "s"}** for ${TRIP.checkIn} → ${TRIP.checkOut} (${TRIP.nights} nights, tent, up to ${TRIP.maxPeople} people)`,
    "",
    "| Source | Park | Site | Link |",
    "|---|---|---|---|",
  ];
  for (const o of openings) {
    lines.push(
      `| ${o.source} | ${escapeMd(o.parkName)} | ${escapeMd(o.siteName)} | [Book now](${o.url}) |`,
    );
  }
  lines.push("", "_Book fast — MDW spots vanish in minutes._");
  return lines.join("\n");
}

export async function notify(openings: Opening[]): Promise<void> {
  if (openings.length === 0) return;

  const title = `[camp-watch] ${openings.length} MDW campsite${openings.length === 1 ? "" : "s"} just opened — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const body = renderBody(openings);

  if (DRY_RUN) {
    console.log("[DRY_RUN] would open GitHub issue:");
    console.log(`  title: ${title}`);
    console.log(body);
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // "owner/name"
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
