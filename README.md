# Pamten Frontend

React + Vite frontend for the Pamten ownership mapping platform. Visualises corporate ownership hierarchies as an interactive graph.

**Live (dev):** https://dev.owlgraph.org  
**Backend API:** https://api-dev.owlgraph.org/docs

The `*.onrender.com` URLs still serve the same deployments, but the owlgraph.org domains are canonical — and only those are listed in the backend's `CORS_ORIGINS`, so the frontend must be reached at `dev.owlgraph.org` for API calls to work.

---

## Tech stack

| Layer | Library |
|---|---|
| Framework | React 18 + TypeScript (strict mode) |
| Build | Vite 5 |
| Graph | Cytoscape.js (the app computes positions itself: `preset` + `concentric`) |
| Map | react-simple-maps + world-atlas (countries) + us-atlas (states) |
| HTTP | Axios |
| Icons | react-icons (Feather set) |
| Hosting | Render (static site) |

---

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build → dist/
```

Set the API base URL in a `.env.local` file if running the backend locally:

```
VITE_API_URL=http://localhost:8000
```

---

## Project structure

```
src/
├── App.tsx                  # Root component, layout, tab routing
├── types.ts                 # Shared TypeScript types (single source of truth)
├── index.css                # All styles (dark theme)
├── main.tsx                 # React entry point
├── vite-env.d.ts            # Module declarations (react-simple-maps)
├── components/
│   ├── Graph.tsx            # Cytoscape.js ownership graph + welcome screen
│   ├── NodePanel.tsx        # Entity / person detail panel (Overview + Timeline tabs)
│   ├── TimelinePanel.tsx    # Historical ownership + role timeline
│   ├── SearchBar.tsx        # Debounced entity / person search
│   ├── OwnershipBadge.tsx   # Ownership type + stake % pill
│   ├── MapView.tsx          # SVG world map (right panel)
│   ├── MapPanel.tsx         # Country list + entity drilldown (left panel)
│   ├── ScraperPanel.tsx     # Multi-source scraper UI with per-source toggles
│   ├── Toast.tsx            # Notification banner (transient; a refresh summary stays until dismissed)
│   └── AuthModal.tsx        # Login / register modal
├── context/
│   └── AuthContext.tsx      # JWT auth state, login/register/logout
├── services/
│   └── api.ts               # Axios client + all API calls
└── utils/
    ├── isoCountries.ts      # ISO 3166-1 alpha-2 ↔ numeric mapping for map
    ├── isoSubdivisions.ts   # ISO 3166-2 names + the FIPS→code join for the state map
    └── mapGeography.ts      # Lazily-loaded map geometry (detailed world, US states)
```

---

## Documentation

| Topic | Where |
|---|---|
| Features — graph, detail panel, timeline, map, scraper and federation panels, sign-in | [`docs/features.md`](docs/features.md) |
| Releases, versions and the installed app's minimum-version check | [`docs/releases.md`](docs/releases.md) |
| Branch protection and security updates | [`docs/development.md`](docs/development.md) |
| Play Store data-safety answers | [`docs/store-privacy-answers.md`](docs/store-privacy-answers.md) |
| The API this app talks to | [pamten-backend](https://github.com/gemane/pamten-backend) |

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | *(required in a production build)* | Backend **origin**, e.g. `https://api-dev.owlgraph.org`. The `/v1` prefix is appended in `services/api.ts`, so don't include it here or requests go to `/v1/v1`. A production build with this unset **throws at startup** rather than falling back — a silent fallback once meant a build could read and write the wrong environment. `npm run dev` falls back to the dev API. |
| `VITE_DEPLOY_ENV` | *(unset)* | Set to `development` **only on the Render dev static site**. It marks the dev site: an amber strip on every page ("Development site: test data, may be reset or deleted at any time", shorter on a phone, not dismissable), `DEV · ` in front of the tab title, and `<meta name="robots" content="noindex, nofollow">`. Any other value, or none, builds without any of it. Vite writes the value into the code at build time, so in the production release (`release.yml`, which never sets it) the banner's code, text and CSS are dropped from the bundle — nothing of the dev marking ships. See `src/devSite.ts` and `devSiteHtmlPlugin` in `vite.config.ts`. |

---

## Deployment

The app is deployed on Render as a static site built from this repo. Render runs `npm run build` and serves `dist/`. Any push to **`develop`** triggers a redeploy.

The dev static site's environment on Render carries `VITE_DEPLOY_ENV=development` (with `VITE_API_URL`), which shows the development banner. Being a build-time variable, a change to it takes effect with the next build.

---

## Branch model

Two long-lived branches, matching [pamten-backend](https://github.com/gemane/pamten-backend):

| Branch | Deploys to | Purpose |
|---|---|---|
| `develop` | Render (dev) — auto-deploy on push | Integration branch; everything lands here first |
| `main` | nothing yet (production, once it exists) | Only code verified running on the dev deploy |

The flow is **feature branch → PR into `develop` → verify on the dev deploy → fast-forward `main` to `develop`**. `develop` is the default branch, so new PRs target it automatically. Promotion is a fast-forward, never a merge or squash, so the two histories can't drift:

```bash
git checkout main && git pull
git merge --ff-only origin/develop
git push origin main
```

Keep the two repos in step: a change that needs the other repo reaches `main` in the same
promotion round. Branch protection and security updates: [`docs/development.md`](docs/development.md).

---

## Licence

Source code: [MIT Licence](LICENSE)

The database content served by the Pamten API is licensed
under [ODbL v1.0](https://opendatacommons.org/licenses/odbl/1-0/).

Built with assistance from Claude by Anthropic and Claude Code CLI.
