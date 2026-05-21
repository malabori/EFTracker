# EFTRACKER

A single-page web app that tracks **Escape From Tarkov** quest progress.
Pulls the live quest list from the public [Tarkov.dev](https://tarkov.dev)
GraphQL API, groups quests by trader in a two-column layout, and lets you
tick off completion. Highlights Kappa-required quests, supports search +
filter, orders quests by prerequisite chain within each trader, and
persists progress to `localStorage`.

No framework. No backend. No tracking.

## Quick start

```bash
npm install
npm run dev        # vite dev server with HMR
```

Open the URL printed by Vite (usually `http://localhost:5173`).

## Scripts

| script                 | what it does                        |
| ---------------------- | ----------------------------------- |
| `npm run dev`          | Vite dev server                     |
| `npm run build`        | Production bundle to `dist/`        |
| `npm run preview`      | Serve the built bundle locally      |
| `npm test`             | Vitest run (pure-helper unit tests) |
| `npm run test:watch`   | Vitest in watch mode                |
| `npm run lint`         | ESLint over JS                      |
| `npm run format`       | Prettier write                      |
| `npm run format:check` | Prettier check (used in CI)         |

CI (`.github/workflows/ci.yml`) runs lint → format:check → test → build
on every push and PR to `main`.

## Project layout

```
src/
  main.js          entry — wires init() + load()
  state.js         shared singleton state + DOM refs
  storage.js       safe localStorage wrappers
  api.js           Tarkov.dev fetch + 12 h cache
  lib.js           pure helpers (escape, hi, parsePartIndex, topoSortByTrader)
  dom.js           el() — small element builder
  shell.js         outer HTML shell template + ref binding
  background.js    background grid + noise <div>s
  confetti.js      kappa-celebration canvas animation
  sidebar.js       JS-driven sticky sidebar positioning
  nav.js           mobile burger menu
  render.js        all task-list rendering, stats, toast, partial updates
  lib.test.js      Vitest suite for the pure helpers
  styles/
    main.css       layered CSS (base, layout, components, utilities)
    tokens.css     design tokens + @property registrations

embed/
  eftracker-embed.js   <eftracker-embed src="…"> web component that
                       inlines a remote HTML file into a host page
                       (used to embed the built app into the marketing
                       site).

wp/
  eftracker-wp.css     WordPress skin applied to blog/archive/single
                       templates so they share the EFTRACKER look.

index.html             dev/build mount point — referenced by Vite.
```

`embed/` and `wp/` are static assets shipped alongside the built app.
They are not part of the Vite bundle.

## How quest ordering works

`src/lib.js → topoSortByTrader` assigns each task a "depth" equal to one
more than the max depth of its same-trader prerequisites (with a
`visiting` set to break cycles). Sorting by
`(depth, minPlayerLevel, partIndex, name)` produces a topo-consistent
ordering with a single `Array.sort` — prereqs always precede dependents.

Roman / Arabic "Part N" suffixes are parsed by `parsePartIndex` so
"… Part II" sorts before "… Part X".

## Progress storage

| key                        | what                                            |
| -------------------------- | ----------------------------------------------- |
| `eft-task-progress-stable` | `{ [taskId]: true }` map of completions         |
| `eft-ui`                   | `{ collapsed, openTask }` UI prefs              |
| `eft-kappa-celebrated`     | `true` once the kappa confetti fired            |
| `eft_tasks_cache_v2`       | `{ ts, data }` — last GraphQL payload, 12 h TTL |

All access is wrapped in `safe*` helpers in `src/storage.js` so a
disabled / full `localStorage` doesn't crash the app.

## Contributing

Keep the patches small and self-contained. Run before committing:

```bash
npm run lint
npm run format
npm test
```
