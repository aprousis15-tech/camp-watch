# camp-watch

Polls 11 specific Hipcamp listings every ~5 min for availability across two camping weekends in 2026, and opens a GitHub issue (which emails you, via your existing repo-watch notifications) when one of them opens up.

Listings, trips, ranks, and tiers all come from the **`mdw_2026_two_trips_v6`** brief — see `src/listings.ts`.

## Trips watched

- **Trip A — MDW** · Fri May 22 → Mon May 25, 2026 (3 nights) · 8 listings
- **Trip B — Weekend after MDW** · Fri May 29 → Mon Jun 1, 2026 (3 nights) · 3 listings

The 3 sites flagged "Skip" in the brief (Larkspurs Hollow, Redwood Paradise, Sacred Earth Retreat) are intentionally not monitored.

## How notifications work

When one or more listings are available, the workflow opens an issue in this repo. Subject leads with the highest-ranked listing (e.g. `[camp-watch] #1 Timber Cove open for Trip A`), body lists every fresh opening grouped by trip. GitHub emails you automatically because you own the repo.

For push too: install the GitHub mobile app and enable issue push notifications.

## How it works

1. **Slug resolution** (`src/resolveSlugs.ts`) — on first run, Playwright searches Hipcamp for each listing by name + location hint, extracts the `/en-US/land/{slug}`, and caches to `slugs.json`. Committed back to the repo so subsequent runs skip resolution.
2. **Availability check** (`src/sources/hipcamp.ts`) — for each listing × its trip, Playwright loads `hipcamp.com/en-US/land/{slug}?arrive=…&depart=…` and inspects the booking widget. If a Reserve / Book / Request CTA is present and enabled (and no "unavailable" message is shown), the listing is considered open for those dates.
3. **Dedupe** (`src/state.ts`) — `state.json` tracks alerted (slug, trip, dates) tuples; the same opening doesn't re-alert.
4. **Notify** (`src/notify.ts`) — only when at least one fresh opening exists.

## Local development

Requires Node 20+ and Playwright Chromium.

```bash
npm install
npx playwright install chromium
npm run check:dry      # runs without opening an issue
npx tsx src/resolveSlugs.ts   # only the slug resolver
```

## Files

```
src/
  index.ts             # main entry
  config.ts            # DRY_RUN, user agent
  trips.ts             # Trip A + Trip B date configs
  listings.ts          # 11 Hipcamp listings (rank, tier, search query)
  resolveSlugs.ts      # one-time slug resolver via Playwright
  sources/
    hipcamp.ts         # per-listing availability check
  state.ts             # dedupe via state.json
  notify.ts            # rank-aware GitHub issue
  types.ts
.github/workflows/check.yml
slugs.json             # cached after first run
state.json             # which openings we've already alerted on
```

## Caveats

- **GitHub Actions cron is best-effort.** Free-tier runs can be delayed 5–15 min during peak load.
- **Hipcamp availability inference is heuristic.** We look for an enabled Reserve CTA + absence of "unavailable" copy. If Hipcamp changes their UI we may need to update selectors. Prefer false positives (alert sent, but listing isn't actually bookable) over false negatives.
- **Slug resolution is the brittle bit.** If Hipcamp's search returns a wrong slug for a listing name, you'll get alerts about the wrong place. Edit `slugs.json` by hand to override; the resolver only ever adds, never replaces existing entries.
- **MDW spots vanish in minutes.** Click the link in the email the instant it arrives.
