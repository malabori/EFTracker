# EFTracking

Escape from Tarkov quest tracker and flea price lookup — the site behind
[eftracking.com](https://eftracking.com).

- **Quests** (`index.html`): every quest grouped by trader in unlock order,
  split into _Available_, _Locked_ and _Completed_. Set your game mode, faction and
  level and the board shows what you can actually take right now, why the rest is
  locked, and your Kappa and Lightkeeper progress. Tick off quests or individual
  objectives; filter by trader (the portrait strip), map, Kappa or Lightkeeper;
  search names, objectives, items and maps.
- **Flea market** (`flea.html`): lowest flea listing, 24-hour average and range,
  best trader offer, where to sell, and value per inventory slot — for PvP or PvE.

Behind both pages runs an ASCII backdrop: drifting dust, and scenes from the
game (Lighthouse, Killa, Kappa, the BTR, cultists, Tagilla, ULTRA, and the
"Head, Eyes" death screen) that materialise, linger and dissolve. The footer
switch sets it to Animated, Still or Off; visitors who ask their system for
reduced motion get Still.

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
                        raid clock, formatting, header/footer behaviour,
                        backdrop.js + ascii-art.js (the ASCII background)
src/quests/             quest board: data.js (fetch/cache), model.js (pure
                        quest logic), progress.js (saving + migration),
                        view.js (HTML), main.js (wiring)
src/flea/               flea page: data.js, model.js, main.js
src/styles/             theme.css (shared look), quests.css, flea.css
src/main.js,            loaded by the eftracking.com WordPress home page; they
src/styles/main.css     frame the site (see Deploying)
wp/eftracker-wp.css     loaded by the WordPress site to style its blog pages
data/                   offline quest snapshot, used only if tarkov.dev is down
scripts/                update-snapshot.mjs (refreshes data/)
tests/                  unit tests for the pure logic
```

## Deploying

Two pieces:

1. **GitHub Pages** publishes the `clean` branch to
   <https://malabori.github.io/EFTracker/> about a minute after it changes
   (**Settings → Pages**). `main` is kept identical to `clean`.
2. **eftracking.com** is a WordPress (Divi) site. Its home page holds this snippet
   in a Code module, which shows the GitHub site in a full-window frame — so the
   home page always shows the latest version without being edited:

   ```html
   <link
     rel="stylesheet"
     href="https://malabori.github.io/EFTracker/src/styles/main.css"
   />
   <div id="eft-app"></div>
   <script src="https://malabori.github.io/EFTracker/src/main.js"></script>
   ```

   The site's blog pages also load `wp/eftracker-wp.css` from GitHub Pages for
   their dark styling. **Don't move, rename or delete `src/main.js`,
   `src/styles/main.css` or `wp/eftracker-wp.css`.**

Because the site runs in a frame on a different domain, progress the old
tracker saved on eftracking.com itself is passed into the frame once (see
`src/main.js` and `takeLegacyHandoff` in `src/quests/main.js`).

## Working on it

```bash
npm install
npm run dev      # local server with live reload at http://localhost:5173
npm run check    # lint + formatting + unit tests (what CI runs)
npm run snapshot # refresh data/snapshot-*.json from tarkov.dev (needs internet)
```

## The ASCII backdrop

Scenes live in `src/shared/ascii-art.js`: plain text art plus a caption, a glow
colour and the boxes of characters that glow. To add one, append an entry there
(the unit tests check that every glow box lands on the drawing). The motion is
done by the browser's compositor (Web Animations), so script only runs while a
scene fades in or out; keep it that way so the page stays light on laptops and
phones.

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
| `eftracking.settings.v1`     | mode, faction, level, background (animated/still/off)  |
| `eftracking.ui.v1`           | quest board filters, collapsed traders, selected quest |
| `eftracking.flea.v1`         | last flea search and sort                              |
| `eftracking.tasks.v1.<mode>` | cached quest data (refreshed after 6 hours)            |

On first load, progress saved by earlier versions of the site
(`eft_tracker_state_v*` from the February 2026 Quest Board, `eft-task-progress-stable`
from 2025) is imported automatically; the old keys are left untouched.
