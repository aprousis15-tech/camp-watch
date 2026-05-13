# camp-watch

Scans Hipcamp every ~5 min for tent listings within ~2.5h of SF that are bookable for **MDW 2026** and the **weekend after**, and surfaces only listings matching the quality profile from the `mdw_2026_two_trips_v6` brief:

- **≥95% rating** (or ≥4.75 stars)
- **≥50 reviews**
- **Tent-friendly**
- **Star Host preferred** (boost, not requirement)

When a qualifying listing first appears as bookable, the workflow opens a GitHub issue (which emails the watcher). The live dashboard is rebuilt every run.

## Live dashboard

**[aprousis15-tech.github.io/camp-watch](https://aprousis15-tech.github.io/camp-watch/)** — share this URL with anyone.

## Trips watched

- **Trip A — MDW** · Fri May 22 → Mon May 25, 2026 (3 nights)
- **Trip B — Weekend after MDW** · Fri May 29 → Mon Jun 1, 2026 (3 nights)

## Files

```
src/
  index.ts                # main entry
  config.ts
  trips.ts                # Trip A + B date configs
  listings.ts             # the 11 reference listings from the brief
  sources/
    hipcampScan.ts        # bbox scanner (Playwright) + quality filter
  site/
    build.ts              # generates docs/index.html
  state.ts                # dedupe via state.json
  notify.ts               # rank-aware GitHub issue
  types.ts
.github/workflows/check.yml
docs/                     # generated each run, deployed to Pages
state.json
```

## Local development

Requires Node 20+.

```bash
npm install
npx playwright install chromium
npm run check:dry         # runs scan + builds site, no email
open docs/index.html      # inspect the generated page locally
```

## Knobs

- **Bounding box** — `BBOX` in `src/sources/hipcampScan.ts` (currently roughly Mendocino → Big Sur → Sierra foothills)
- **Quality thresholds** — `MIN_RATING_PCT`, `MIN_RATING_STARS`, `MIN_REVIEWS` in the same file
- **Trip dates** — `src/trips.ts`. After editing, delete `state.json` so prior alerts re-fire.

## Caveats

- **Heuristic scraping.** Hipcamp's class names change; selectors are intentionally loose but can break. If the run reports "raw results: 0" repeatedly, the DOM shape moved.
- **Quality bar trusts what's on the search card.** If Hipcamp hides review counts on some cards, those listings won't qualify even if they should.
- **GitHub Pages cache** can lag 1–3 min after deploy.
