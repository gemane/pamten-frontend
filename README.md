# Pamten Frontend

React + Vite frontend for the Pamten ownership mapping platform. Visualises corporate ownership hierarchies as an interactive graph.

**Live:** https://pamten-frontend.onrender.com  
**Backend API:** https://pamten-backend-yrbh.onrender.com/docs

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
- Start screen shows 3 randomly chosen example companies as quick-launch chips
- Clicking the **Pamten** logo in the top-left clears the graph and returns to the start screen
- Ownership graph rendered with Cytoscape.js cola layout (randomised, wide spacing)
- Node colours: company `#4A90D9`, brand `#E67E22`, holding `#8E44AD`, person `#27AE60`
- Edge colours by ownership type: full/majority `#2ECC71`, minority `#F39C12`, controlling `#E74C3C`
- Click a node to open the detail panel; double-click to expand its connections directly
- **Expand into graph** button in the panel loads an entity's full ownership graph

### Node detail panel
- **Entity panel**: shows company logo (fetched from Wikidata via P154/P18 → Wikimedia Commons), ownership badges, subsidiaries, executives, and a link to Wikipedia
- **Person panel**: shows person photo (fetched from Wikipedia REST API, falls back to name search), nationality, and Wikipedia link
- **Overview / Timeline tabs** for entities

### Timeline view
- Shows ownership changes, subsidiaries acquired, and executive roles grouped by year
- Undated relationships appear under "No date recorded"

### Map view
- World SVG map with countries highlighted where entities are headquartered
- Colour intensity scales with entity count per country
- Scroll to zoom, drag to pan, reset button top-right
- Click a country → left panel shows its entity list; click an entity to load it into the graph

### Scraper panel (admin only)
- Triggers scrapes across all enabled data sources simultaneously via `/scraper/run-all`
- Sources: **Wikidata** (SPARQL), **SEC EDGAR** (SC 13D/13G ownership filings + Form 3/4 executives), **OpenCorporates** (requires API key)
- Depth selector 1–3 (levels of subsidiaries to follow)
- Per-source toggle switches — each source can be enabled/disabled independently by admins
- Master switches are controlled by env vars on the backend (`SCRAPER_ENABLED`, `SCRAPER_SEC_EDGAR_ENABLED`)
- After a scrape, **Load into graph →** button jumps straight to the graph view with results

### Authentication
- JWT-based, 7-day tokens stored in `localStorage`
- First registered account becomes **admin**; subsequent accounts start as **viewer**
- Roles: `admin` (full access including scraper), `contributor` (future), `viewer` (read-only)
- Login / register modal accessible from the header

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `https://pamten-backend-yrbh.onrender.com` | Backend base URL |

---

## Deployment

The app is deployed on Render as a static site built from this repo. Render runs `npm run build` and serves `dist/`. Any push to `main` triggers a redeploy.

---

## Licence

Source code: [MIT Licence](LICENSE)

The database content served by the Pamten API is licensed
under [ODbL v1.0](https://opendatacommons.org/licenses/odbl/1-0/).

Built with assistance from Claude by Anthropic and Claude Code CLI.
