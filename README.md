# EFTracking

Escape from Tarkov quest tracker and flea price lookup — the site behind
[eftracking.com](https://eftracking.com).

- **Quest Board** (`index.html`): every quest grouped by trader in unlock order,
  split into _Available_, _Locked_ and _Completed_. Set your game mode, faction and
  level and the board shows what you can actually take right now, why the rest is
  locked, and your Kappa and Lightkeeper progress. Tick off quests or individual
  objectives; filter by trader, map, Kappa or Lightkeeper; search names, objectives,
  items and maps.
- **Flea Prices** (`flea.html`): lowest flea listing, 24-hour average and range,
  best trader offer, where to sell, and value per inventory slot — for PvP or PvE.

All data comes live from [tarkov.dev](https://tarkov.dev)'s free community API.
There is no account and no server: progress is saved in the visitor's browser
(with export/import to move between devices).

## How the site is built

Plain HTML, CSS and JavaScript modules — **no build step**. The files in this repo
are exactly what visitors download, so any static host works (it's on GitHub
Pages). Don't add anything that needs compiling (npm imports in `src/`, TypeScript,
CSS preprocessors); the browser loads `src/` directly.

```
index.html, flea.html   the two pages (static markup)
src/shared/             used by both pages: API client, settings, storage,
                        raid clock, formatting, header/footer behaviour
src/quests/             quest board: data.js (fetch/cache), model.js (pure
                        quest logic), progress.js (saving + migration),
                        view.js (HTML), main.js (wiring)
src/flea/               flea page: data.js, model.js, main.js
src/styles/             theme.css (shared look), quests.css, flea.css
data/                   offline quest snapshot, used only if tarkov.dev is down
scripts/                update-snapshot.mjs (refreshes data/)
tests/                  unit tests for the pure logic
```

## Deploying

GitHub Pages publishes the site straight from a branch: whatever is on that branch
is live about a minute after it changes. Check which branch under
**Settings → Pages → Build and deployment → Branch** — as of October 2026 it was
set to `clean`, so changes merged into `main` don't appear on the site until Pages
publishes `main` (or `main` is merged into `clean`).

When switching the branch, confirm the **Custom domain** box on the same page
still says `eftracking.com`.

## Working on it

```bash
npm install
npm run dev      # local server with live reload at http://localhost:5173
npm run check    # lint + formatting + unit tests (what CI runs)
npm run snapshot # refresh data/snapshot-*.json from tarkov.dev (needs internet)
```

## Data and correctness notes

- Quests come from `tasks(gameMode: regular | pve)`. Faction-specific quests use
  `factionName`, so picking BEAR or USEC hides the other faction's versions and
  keeps Kappa totals achievable.
- A quest is _locked_ until its prerequisites are complete (a requirement that only
  needs the quest accepted counts once that quest is unlocked; requirements met by
  _failing_ a quest can't be tracked and never block) and, if you set a level, until
  you reach its minimum level.
- Maps come from each objective's map data, not guessed from the text.
- If tarkov.dev ever rejects part of the query (its schema changed), the site
  retries with a smaller query and the status line says **limited detail** — a cue
  to update `QUEST_QUERY` in `src/quests/data.js`.
- The raid clocks use tarkov.dev's formula: in-raid time runs at 7× real time from
  Moscow time, and the raid menu's two options are 12 hours apart.

## Saved data (localStorage)

| key                          | contents                                               |
| ---------------------------- | ------------------------------------------------------ |
| `eftracking.progress.v1`     | completed quests and ticked objectives, per game mode  |
| `eftracking.settings.v1`     | mode, faction, level, CRT effect                       |
| `eftracking.ui.v1`           | quest board filters, collapsed traders, selected quest |
| `eftracking.flea.v1`         | last flea search and sort                              |
| `eftracking.tasks.v1.<mode>` | cached quest data (refreshed after 6 hours)            |

On first load, progress saved by earlier versions of the site
(`eft_tracker_state_v*` from the February 2026 Quest Board, `eft-task-progress-stable`
from 2025) is imported automatically; the old keys are left untouched.
