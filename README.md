# Pamten Frontend

React + Vite frontend for the Pamten ownership mapping platform. Visualises corporate ownership hierarchies as an interactive graph.

**Live:** https://pamten-frontend.onrender.com  
**Backend API:** https://pamten-backend-yrbh.onrender.com/docs

---

## Tech stack

| Layer | Library |
|---|---|
| Framework | React 18 (plain JSX, no TypeScript) |
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
├── App.jsx                  # Root component, layout, tab routing
├── index.css                # All styles (dark theme)
├── main.jsx                 # React entry point
├── components/
│   ├── Graph.jsx            # Cytoscape.js ownership graph
│   ├── NodePanel.jsx        # Entity / person detail panel (Overview + Timeline tabs)
│   ├── TimelinePanel.jsx    # Historical ownership + role timeline
│   ├── SearchBar.jsx        # Debounced entity / person search
│   ├── OwnershipBadge.jsx   # Ownership type + stake % pill
│   ├── MapView.jsx          # SVG world map (right panel)
│   ├── MapPanel.jsx         # Country list + entity drilldown (left panel)
│   ├── ScraperPanel.jsx     # Wikidata scraper UI with per-source toggles
│   └── AuthModal.jsx        # Login / register modal
├── context/
│   └── AuthContext.jsx      # JWT auth state, login/register/logout
├── services/
│   └── api.js               # Axios client + all API calls
└── utils/
    └── isoCountries.js      # ISO 3166-1 alpha-2 ↔ numeric mapping for map
```

---

## Features

### Graph view
- Search for any company, brand, holding, or person
- Ownership graph rendered with Cytoscape.js cola layout
- Node colours: company `#4A90D9`, brand `#E67E22`, holding `#8E44AD`, person `#27AE60`
- Edge colours by ownership type: full/majority `#2ECC71`, minority `#F39C12`, controlling `#E74C3C`
- Click a node to open the detail panel; click **Expand into graph** to load its connections

### Timeline view
- Tabbed inside the node detail panel (Overview / Timeline)
- Shows ownership changes, subsidiaries acquired, and executive roles grouped by year
- Undated relationships appear under "No date recorded"

### Map view
- World SVG map with countries highlighted where entities are headquartered
- Colour intensity scales with entity count per country
- Scroll to zoom, drag to pan, reset button top-right
- Click a country → left panel shows its entity list; click an entity to load it into the graph

### Scraper panel (admin only)
- Triggers a Wikidata SPARQL scrape for a company name
- Depth selector 1–3 (levels of subsidiaries to follow)
- Per-source toggle switches — each scraper source (currently Wikidata) can be enabled/disabled independently
- Master on/off is controlled by `SCRAPER_ENABLED` on the backend (Render env var)
- After a scrape, **Load into graph →** button jumps straight to the graph view

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
