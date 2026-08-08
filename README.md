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
| Graph | Cytoscape.js + cytoscape-cola |
| Map | react-simple-maps + world-atlas |
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
├── vite-env.d.ts            # Module declarations (cytoscape-cola, react-simple-maps)
├── components/
│   ├── Graph.tsx            # Cytoscape.js ownership graph + welcome screen
│   ├── NodePanel.tsx        # Entity / person detail panel (Overview + Timeline tabs)
│   ├── TimelinePanel.tsx    # Historical ownership + role timeline
│   ├── SearchBar.tsx        # Debounced entity / person search
│   ├── OwnershipBadge.tsx   # Ownership type + stake % pill
│   ├── MapView.tsx          # SVG world map (right panel)
│   ├── MapPanel.tsx         # Country list + entity drilldown (left panel)
│   ├── ScraperPanel.tsx     # Multi-source scraper UI with per-source toggles
│   ├── Toast.tsx            # Transient notification banner
│   └── AuthModal.tsx        # Login / register modal
├── context/
│   └── AuthContext.tsx      # JWT auth state, login/register/logout
├── services/
│   └── api.ts               # Axios client + all API calls
└── utils/
    └── isoCountries.ts      # ISO 3166-1 alpha-2 ↔ numeric mapping for map
```

---

## Features

### Graph view
- Search for any company, brand, holding, or person
- Start screen shows data-scale counts (companies · people · ownership relationships · sources, from `GET /stats`) and 3 randomly chosen example companies as quick-launch chips
- Clicking the **Pamten** logo in the top-left clears the graph and returns to the start screen
- Ownership graph rendered with Cytoscape.js cola layout (randomised, wide spacing)
- Node colours: company `#4A90D9`, brand `#E67E22`, holding `#8E44AD`, government `#B03A2E`, foundation `#16A085`, fund `#B7950B`, nonprofit `#C0398B`, person `#27AE60`
- Edge colours by ownership type: full/majority `#2ECC71`, minority `#F39C12`, controlling `#E74C3C`
- Click a node to open the detail panel; double-click to expand its connections directly
- **Expand into graph** button in the panel loads an entity's full ownership graph

### Node detail panel
- **Entity panel**: shows company logo (fetched from Wikidata via P154/P18 → Wikimedia Commons), ownership badges, subsidiaries, executives, **succession** links (*Succeeded by* / *Formerly*, e.g. Twitter → X Corp.), and a link to Wikipedia. Entities collapsed from several BODS filings (an id-less party re-declared per controlled company) list every declaring **source statement** id, so per-statement provenance stays visible after the merge
- **Person panel**: shows person photo (fetched from Wikipedia REST API, falls back to name search), nationality, **place of birth**, the **positions** they hold and **ownership stakes** they own, the **sources** behind those facts, and a Wikipedia link
- **Type markers**: every row in the relationship lists (owners, subsidiaries, executives, dual-listed, succession) carries a small coloured marker matching the node's colour in the graph — round for a person, rounded-square for an entity. The palette lives once in `src/utils/entityColors.ts` and is read by the graph, the legend, the map panel and the scraper results, so they cannot drift.
- **Long subsidiary lists are grouped** by how the holding is held — *Direct holdings* open, *Held indirectly* and *Relationship not stated* collapsed — once a list exceeds 12 and actually splits. Section headers carry the true count from the server, which matters because sections are capped and a rendered list can be shorter than reality (Barclays: 118 subsidiaries).
- **The graph omits indirect ownership edges.** GLEIF records "X is the ultimate parent of Y" alongside the chain that already links them; drawn, that shortcut is indistinguishable from a direct holding. All 263 in the database point at something already reachable by walking direct edges, so nothing becomes unreachable.
- **Overview / Timeline tabs** for entities

### Timeline view
- Shows ownership changes, subsidiaries acquired, and executive roles grouped by year
- Undated relationships appear under "No date recorded"

### Map view
- World SVG map with countries highlighted where entities are headquartered
- Colour intensity scales with entity count per country
- Scroll to zoom, drag to pan, reset button top-right
- Click a country → left panel shows its entity list; click an entity to load it into the graph

### Scraper panel (graduated by role)

The tab is visible to everyone, but each section only appears for roles the API would actually let act on it — the predicates live in `src/utils/scrapeAccess.ts` and mirror the backend's guards. A section that 403s is worse than one that isn't shown.

| Section | Who sees it |
|---|---|
| Status header, **Recent activity** | everyone, including logged-out visitors |
| Run form, source selector, per-source toggles, **Review duplicate persons** | contributor, admin |
| **BODS bulk import** notes, **Federation panel** | admin |

Order top to bottom: status header → recent activity → run controls → bulk datasets → federation, so the read-only content everyone can use comes before the controls most visitors can't.

Visitors get a plain description of what the project is (the signed-in blurb describes importing, which they cannot do), plus a **source catalogue**: every source the platform draws on, with its own link, a short description, and a reliability band with its ranking score. The catalogue is public — where the data comes from is the case for the whole platform.

The run form is hidden rather than disabled for those who can't use it, and no sign-in prompt is shown — for a visitor the tab is simply a read-only activity view, not a broken scraper. Federation reads are `require_contributor` server-side, but the panel exists to add, remove and pull peers — all admin-only — so it's admin-gated here.

- Triggers scrapes across all enabled data sources simultaneously via `/scraper/run-all`
- Sources: **Wikidata** (SPARQL), **SEC EDGAR** (SC 13D/13G ownership filings + Form 3/4 executives), **OpenCorporates** (requires API key)
- Depth selector 1–3 (levels of subsidiaries to follow)
- Per-source toggle switches — each source can be enabled/disabled independently by admins
- Master switches are controlled by env vars on the backend (`SCRAPER_ENABLED`, `SCRAPER_SEC_EDGAR_ENABLED`)
- After a scrape, **Load into graph →** button jumps straight to the graph view with results
- **BODS bulk import** — a separate card for the **GLEIF** and **UK PSC** beneficial-ownership datasets (bulk file import with jurisdiction / limit filters), distinct from the per-company scrapers above
- **Recent activity** — a live run log (polls every 6s) showing each scrape's status (running / ok / failed / stale) and node count; covers UI *and* `update.sh` runs (backed by `/scraper/runs`). Public, but the error text is served only to contributors and admins
- **Review duplicate persons** opens a modal (tabs: To review / Merged / Kept separate) to merge duplicate people, keep confirmed-different ones separate, or run an auto-dedupe — backed by the backend duplicate scan

### Federation panel (admin only)
Inside the Scraper tab, and shown only to admins — sync ownership data with **trusted peer** instances (see the backend README's *Federation* section for setup):
- Shows whether federation is enabled and what this instance publishes (entity / person / ownership counts), plus your signing `key_id` (or an "unsigned" note)
- Register a trusted peer (name, base URL, optional access token, and their public key), then **Pull** to import and reconcile their data
- Pulled peers show a **verified / unverified** badge, and each pull reports whether the peer's signature was cryptographically verified
- Requires `FEDERATION_ENABLED` (and, for signing, `FEDERATION_SIGNING_KEY`) on the backend

### Authentication
- **15-minute** JWT access tokens held **in memory only** — never `localStorage`, which any script on the page can read. An XSS bug therefore cannot walk off with a durable credential.
- The session itself is carried by an `httpOnly` refresh cookie that JavaScript cannot read at all. On load the app trades it for a fresh access token (`AuthContext` calls `refreshSession()`); when a request 401s, the client refreshes once and replays it, so the short token lifetime is invisible. Concurrent refreshes are coalesced into one request — the server rotates the token on use and treats a second presentation as a replay.
- Logging out calls `POST /auth/logout` so the cookie is revoked server-side. Clearing the token locally alone would not end the session: the next reload would trade the cookie for a new one.
- Because the cookie is `SameSite=Lax`, the frontend and API must share a registrable domain (`dev.owlgraph.org` + `api-dev.owlgraph.org`). Running `npm run dev` on `localhost` against the deployed API is *not* same-site, so no cookie is sent and the session ends after 15 minutes — run the backend locally to avoid that.
- First registered account becomes **admin**; subsequent accounts start as **viewer**
- Roles: `admin` (full access), `contributor` (scraping, dedup, federation), `viewer` (read-only)
- Login / register modal accessible from the header
- **Settings → Password** changes your own password (current password required). This is the route that works when email delivery doesn't — the reset-by-email flow needs SMTP, which Render blocks. Other sessions are signed out; yours is re-issued, so you stay logged in where you are.
- **Settings → Two-factor authentication** enrols a TOTP authenticator app
- **Settings → Delete account** permanently deletes your own account (password required, two-step confirm) and signs you out. Required by both app stores for any app with account creation, and the route for a GDPR erasure request. Reports you filed are kept but anonymised; the backend refuses for the `ADMIN_EMAIL` bootstrap account and for the last remaining admin, and shows its reason.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | *(required in a production build)* | Backend **origin**, e.g. `https://api-dev.owlgraph.org`. The `/v1` prefix is appended in `services/api.ts`, so don't include it here or requests go to `/v1/v1`. A production build with this unset **throws at startup** rather than falling back — a silent fallback once meant a build could read and write the wrong environment. `npm run dev` falls back to the dev API. |

---

## Deployment

The app is deployed on Render as a static site built from this repo. Render runs `npm run build` and serves `dist/`. Any push to **`develop`** triggers a redeploy.

### Branch model

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

A repository ruleset protects both branches, requiring `Test & Build` on each. `develop` requires a pull request (no approving review, so a solo maintainer can self-merge) and rejects direct pushes. `main` takes no pull request — that's what allows the fast-forward push, since GitHub's merge button can't do one — but a push is accepted only if that exact commit already passed CI on `develop`; anything unverified is rejected. Neither branch has bypass actors, and force-pushes are blocked on both; `develop` lets an admin force-merge a red PR when a dev-only experiment warrants it. CI runs on pushes and PRs to both branches.

Keep the two repos in step — a frontend change that needs a backend change should reach `main` in the same promotion round, since both deploy from the same branch names.

---

## Licence

Source code: [MIT Licence](LICENSE)

The database content served by the Pamten API is licensed
under [ODbL v1.0](https://opendatacommons.org/licenses/odbl/1-0/).

Built with assistance from Claude by Anthropic and Claude Code CLI.
