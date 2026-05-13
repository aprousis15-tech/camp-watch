import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ScanResult } from "../sources/hipcampScan.ts";
import { ALL_LISTINGS } from "../listings.ts";
import type { Candidate } from "../types.ts";

const DOCS_DIR = resolve(process.cwd(), "docs");

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderRating(c: Candidate): string {
  if (c.ratingValue == null) return "<span class='dim'>—</span>";
  if (c.ratingBasis === "stars") return `★ ${c.ratingValue.toFixed(2)}`;
  return `${c.ratingValue}%`;
}

function renderReviews(c: Candidate): string {
  if (c.reviews == null) return "<span class='dim'>—</span>";
  return `${c.reviews}`;
}

function renderCandidateRow(c: Candidate): string {
  const cls = c.qualifies ? "row pass" : "row";
  return `<tr class="${cls}">
    <td class="title"><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a></td>
    <td>${esc(c.locationText)}</td>
    <td class="num">${renderRating(c)}</td>
    <td class="num">${renderReviews(c)}</td>
    <td>${c.starHost ? "<span class='badge'>Star Host</span>" : ""}</td>
    <td>${esc(c.priceText)}</td>
    <td class="num score">${c.score.toFixed(1)}</td>
  </tr>`;
}

function renderTripSection(r: ScanResult): string {
  const qualifying = r.candidates.filter((c) => c.qualifies);
  const others = r.candidates.filter((c) => !c.qualifies);
  const tripClass = r.trip.id === "A" ? "trip-a" : "trip-b";

  const qualifyingRows = qualifying.length
    ? qualifying.map(renderCandidateRow).join("\n")
    : `<tr><td colspan="7" class="empty">No qualifying listings open for these dates right now. Cron is still watching.</td></tr>`;

  const othersRows = others.slice(0, 30).map(renderCandidateRow).join("\n");

  return `
    <section class="trip ${tripClass}">
      <h2>Trip ${r.trip.id} — ${esc(r.trip.label)}</h2>
      <p class="meta">${r.trip.checkIn} → ${r.trip.checkOut} · ${r.trip.nights} nights · ${qualifying.length} qualifying · ${r.candidates.length} total bookable</p>

      <h3>Passes the bar (≥95% / 50+ reviews)</h3>
      <table>
        <thead>
          <tr><th>Listing</th><th>Location</th><th>Rating</th><th>Reviews</th><th>Host</th><th>Price</th><th>Score</th></tr>
        </thead>
        <tbody>${qualifyingRows}</tbody>
      </table>

      <details>
        <summary>${others.length} other bookable listings (didn't meet quality bar)</summary>
        <table>
          <thead>
            <tr><th>Listing</th><th>Location</th><th>Rating</th><th>Reviews</th><th>Host</th><th>Price</th><th>Score</th></tr>
          </thead>
          <tbody>${othersRows}</tbody>
        </table>
      </details>
    </section>
  `;
}

function renderReferenceGrid(): string {
  const rows = ALL_LISTINGS.map((l) => {
    return `<tr>
      <td>#${l.rank}</td>
      <td>${esc(l.name)}</td>
      <td>${esc(l.locationHint)}</td>
      <td><span class="tier-${l.tier}">${l.tier}</span></td>
      <td>Trip ${l.trip}</td>
    </tr>`;
  }).join("\n");
  return `
    <section class="reference">
      <h2>Profile reference — the 11 from the brief</h2>
      <p class="meta">These are the sites that define the "good" profile. The scanner above looks for listings of similar or better quality.</p>
      <table>
        <thead><tr><th>Rank</th><th>Listing</th><th>Location</th><th>Tier</th><th>Trip</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

const CSS = `
  :root {
    --paper: #F7F4EE;
    --paper-deep: #EFEBE2;
    --ink: #1C1A17;
    --ink-soft: #4A463F;
    --ink-mute: #8A857B;
    --rule: #D9D4C8;
    --moss: #4F5B30;
    --rust: #9C5239;
    --gold: #B08842;
    --trip-a: #4F5B30;
    --trip-b: #4A6A7A;
    --pass-bg: #EFF3E5;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: var(--paper); color: var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; font-size: 15px; line-height: 1.55; }
  .page { max-width: 1200px; margin: 0 auto; padding: 48px 24px 80px; }
  header { border-bottom: 1px solid var(--rule); padding-bottom: 24px; margin-bottom: 36px; }
  h1 { font-family: ui-serif, Georgia, serif; font-weight: 500; font-size: clamp(32px, 4vw, 48px); line-height: 1.05; letter-spacing: -0.02em; margin-bottom: 12px; }
  header p { color: var(--ink-soft); }
  .stamp { font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin-top: 12px; }
  section { margin-bottom: 56px; }
  h2 { font-family: ui-serif, Georgia, serif; font-weight: 500; font-size: 28px; letter-spacing: -0.01em; margin-bottom: 6px; }
  .trip-a h2 { color: var(--trip-a); }
  .trip-b h2 { color: var(--trip-b); }
  h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-mute); margin: 22px 0 10px; }
  .meta { color: var(--ink-soft); font-size: 13px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; background: white; border: 1px solid var(--rule); margin-bottom: 12px; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--rule); font-size: 13.5px; vertical-align: top; }
  th { background: var(--paper-deep); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink); }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.title a { color: var(--ink); text-decoration: none; font-weight: 600; }
  td.title a:hover { color: var(--rust); text-decoration: underline; }
  tr.pass { background: var(--pass-bg); }
  tr.pass td.title a { color: var(--moss); }
  .badge { display: inline-block; padding: 2px 8px; background: var(--gold); color: white; border-radius: 2px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
  .empty { text-align: center; color: var(--ink-mute); padding: 20px; font-style: italic; }
  .dim { color: var(--ink-mute); }
  details { margin-top: 12px; }
  summary { cursor: pointer; padding: 8px 12px; background: var(--paper-deep); border-radius: 2px; font-size: 13px; color: var(--ink-soft); margin-bottom: 8px; user-select: none; }
  summary:hover { color: var(--ink); }
  .tier-top { color: var(--gold); font-weight: 700; text-transform: uppercase; font-size: 11px; letter-spacing: 0.1em; }
  .tier-gold { color: var(--moss); font-weight: 700; text-transform: uppercase; font-size: 11px; letter-spacing: 0.1em; }
  .tier-standard { color: var(--ink-mute); text-transform: uppercase; font-size: 11px; letter-spacing: 0.1em; }
  footer { margin-top: 64px; padding-top: 24px; border-top: 1px solid var(--rule); color: var(--ink-mute); font-size: 12px; }
  .score { color: var(--moss); font-weight: 600; }
`;

export async function buildSite(results: ScanResult[]): Promise<void> {
  await mkdir(DOCS_DIR, { recursive: true });

  const now = new Date();
  const stamp = now.toISOString().replace("T", " ").slice(0, 16) + " UTC";

  const totalQualifying = results.reduce(
    (n, r) => n + r.candidates.filter((c) => c.qualifies).length,
    0,
  );
  const totalBookable = results.reduce((n, r) => n + r.candidates.length, 0);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>camp-watch · MDW + weekend after</title>
  <meta name="robots" content="noindex" />
  <style>${CSS}</style>
</head>
<body>
  <div class="page">
    <header>
      <h1>camp-watch</h1>
      <p>Hipcamp openings within ~2.5h of SF for Memorial Day weekend and the weekend after. Scanning every 5 min; rows highlighted in green pass the quality bar (≥95% rating, ≥50 reviews).</p>
      <p class="stamp">Last update: ${stamp} · ${totalQualifying} qualifying / ${totalBookable} bookable across both trips</p>
    </header>

    ${results.map(renderTripSection).join("\n")}

    ${renderReferenceGrid()}

    <footer>
      Source: <a href="https://github.com/aprousis15-tech/camp-watch">github.com/aprousis15-tech/camp-watch</a> · runs every 5 min via GitHub Actions · alerts open as GitHub issues
    </footer>
  </div>
</body>
</html>`;

  await writeFile(resolve(DOCS_DIR, "index.html"), html, "utf8");
  // GitHub Pages: tell Jekyll not to process this directory.
  await writeFile(resolve(DOCS_DIR, ".nojekyll"), "", "utf8");
}
