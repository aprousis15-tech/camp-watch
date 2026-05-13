# camp-watch

Polls ReserveCalifornia and Recreation.gov every ~5 min for tent campsite openings within ~2.5h of San Francisco for **Memorial Day Weekend 2026 (Fri May 22 → Sun May 24)**, and opens a GitHub issue (which emails you, via your existing repo-watch notifications) when a site opens.

## How notifications work

When an opening is detected, the workflow opens an issue in this repo with title `[camp-watch] N MDW campsite(s) just opened` and a table of bookable sites with direct links. GitHub emails you automatically because you own the repo and are watching it by default.

Want a phone push too? Install the GitHub mobile app and enable push notifications for issues.

## Sources

- **Recreation.gov** — public `/api/camps/availability/campground/{id}/month` endpoint. Verified working.
- **ReserveCalifornia** — UseDirect `search/grid` POST endpoint. Park IDs auto-resolved by name on first run via `search/place`.
- **Hipcamp** — headless Chromium via Playwright (their site is client-rendered, no public API). Scrapes the search-result DOM. Slower (~10s/run) and more fragile than the API sources, but works.

## Files

```
src/
  index.ts                   # main entry, runs sources in parallel
  config.ts                  # trip dates: Fri May 22 → Sun May 24, tent, up to 6 people
  parks.ts                   # ~19 RC parks + 7 Rec.gov campgrounds within 2.5h of SF
  types.ts
  state.ts                   # dedupe via state.json
  notify.ts                  # opens GitHub issue
  sources/
    reservecalifornia.ts     # UseDirect grid + place-search fallback
    recreationgov.ts         # Rec.gov availability/month
.github/workflows/check.yml  # cron: */5 min
state.json                   # which openings we've already alerted on
```

## Local development

Requires Node 20+.

```bash
npm install
npm run check:dry          # runs without opening an issue, just logs
```

## Tuning the park list

Edit `src/parks.ts`. ReserveCalifornia parks are listed by name only — IDs are resolved at runtime, so adding `{ source: "reservecalifornia", name: "Some SP", driveMinutesFromSF: 60 }` is enough. If the name doesn't resolve, the run logs `Could not resolve UseDirect IDs for "Some SP"`.

## Customizing dates / trip details

Edit `src/config.ts`. After changing dates, delete `state.json` to clear previous alerts.

## Caveats

- **GitHub Actions cron is best-effort.** Free-tier runs can be delayed 5–15 min during peak load. MDW spots can vanish faster than that.
- **State commits noise the repo.** Every run that produces a new alert commits an updated `state.json`. Acceptable for low-frequency state; swap to a Gist or KV store if it bothers you.
- **MDW is close.** Most "openings" will be cancellations that vanish in minutes — click the booking link the second you see the email.
