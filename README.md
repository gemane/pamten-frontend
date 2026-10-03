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

## Features

### Graph view
- Search for any company, brand, holding, or person
- **The country filter applies to the sources too.** Picking a country narrows the database results *and* the "search sources for X" scrape behind them: the on-demand lookup resolves within that country, and each source rejects a match it finds elsewhere. Without it, "Alphabet" searched under Germany came back as Alphabet Inc of Mountain View — every source answers a bare name with the most famous company that has it. A match whose country the source cannot determine is still accepted; unknown is not a mismatch
- Start screen shows data-scale counts (companies · people · ownership relationships · sources, from `GET /stats`) and 3 randomly chosen example companies as quick-launch chips
- **Refresh from sources** (panel button) runs in two phases: the instant sources behind the "Searching sources…" overlay, then — for contributors — the minutes-long SEC enrichments (13F holders, Exhibit 21) with the top progress bar running and the button showing *Refreshing…*. It always ends with a summary toast that stays until dismissed ("Refresh of X finished — 13F: 89 holders · Exhibit 21: 12 subsidiaries", or "nothing new from the sources"), the open panel refetches, and if the tab is in the background an OS notification says the same (permission is asked once, on the first refresh click).
- Clicking the **Owlgraph** logo in the top-left — the mark plus the wordmark — clears the graph and returns to the start screen
- Ownership graph rendered with Cytoscape.js cola layout (randomised, wide spacing)
- Node colours: company `#4A90D9`, brand `#E67E22`, holding `#8E44AD`, government `#B03A2E`, foundation `#16A085`, fund `#B7950B`, nonprofit `#C0398B`, person `#27AE60`
- Edge colours by ownership type: full/majority `#2ECC71`, minority `#F39C12`, controlling `#E74C3C`
- Click a node to open the detail panel; double-click to expand its connections directly
- **The panel points at the graph.** The owner or subsidiary row under the mouse (desktop), or the one on the panel's centre line while scrolling (phone), grows its node a little in the graph and draws it a shade darker, with a spring ease in and an ease out, so you can see which box a line of the list is about without clicking it — and the row itself is shown a shade darker at the same moment, so on a phone the list says which row the growing box answers to. The hub never grows, and `prefers-reduced-motion` gets the same sizes without the animation.
- **…and the graph points at the panel.** On desktop, hovering a box in the graph lights up its owner or subsidiary row in the panel (a lighter background with a soft blue ring, faded in and out). A phone has no hover, so there it works one way only.
- **Expand into graph** button in the panel loads an entity's full ownership graph
- **Filters**: one button on the canvas, left of the ⓘ, holds every control over what the graph shows — minimum stake, subsidiaries (Direct | All levels), the year (time travel) and the country the search is scoped to. A badge counts the ones off their default, and the button names the year when the graph shows the past (`Filters · 2019`). Choosing anything closes the panel. On a phone the panel is laid over the page, and **Clear** is its icon alone. Without a graph the button offers the country only; a chosen country also shows as a removable chip in the search box.
- **Minimum stake filter** (in Filters): `Any · ≥5% · ≥25% · >50% · >75%`. Bands rather than a slider, because ownership is *reported* in bands — Companies House PSC states "more than 25%", never a number — and because those thresholds are the ones the rules name. A link whose percentage is undisclosed is always kept, since most ownership links state none (26 of 115 on Barclays, 1 of 28 on Microsoft) and hiding them would delete most of the graph while presenting the rest as the whole picture; the panel says how many of the links on screen can actually be judged.
- **An ink tree behind the graph** — the graph's own shape drawn as a tree: the owners' wide, shallow fan above the company becomes an umbrella crown of long radial branches ending on a flat arc, the subsidiaries' tree below becomes deep, many-branched roots. Faint (6–7 % opacity), ink on the light theme and chalk on the dark, whole at every canvas size, outside the PNG export. The picture is `public/graph-tree.png`, a 1-bit mask (42 KB) that the stylesheet paints through `mask-image`; `node scripts/graph-tree.mjs [seed] [size]` redraws it (the same seed gives the same tree; 23 is the one in use).
- **Subsidiaries as a tree**: below the centred company its subsidiaries are drawn as an org chart — under each parent its children are flowed into left-aligned columns (as many as make that branch about the canvas's shape — wide on a desktop, nearly square on a phone — so Tenet's 772 under one parent are a block, not a 55,000 px row, and Chubb's ten levels are not a 27,000 px strip), and the lines run at right angles: down to a bar under the parent, along it, then down onto the first company of a column or down the gutter beside the column and in from the left. Owners keep their arc above. The graph is fitted to the whole canvas; on a phone, where the canvas is a third of the screen, it starts just below the buttons over the canvas's top and keeps only a narrow margin, instead of the desktop's 80 px. **Subsidiaries: Direct | All levels** in the Filters panel chooses how much of the tree is loaded: **Direct** the one level the profile lists, **All levels** (experimental) the **whole tree** below the company, each company under its actual holder; the panel's subsidiary list then becomes that tree, **indented by level**, with the tree's own count. Both are drawn the same way, so switching only adds or removes the levels below. The switch stays on while you navigate and is in the URL (`#graph/e/<id>/all`); the tree is capped at 2,000 companies and says so when it is larger. **The tree's lines do not cross**: a company sits under its largest holder and, where no stake is stated, its deepest one (Microsoft's flat list names Activision's subsidiaries too — they hang under Activision); a line from further up the same branch that states no stake of its own only repeats the path above it and is not drawn. Only a genuine co-holder from another branch can still cross; its line is drawn faintly. **A centred person** gets the same tree: the companies they own first, then those they only hold a role in. Where they **own and run** a company (Elon Musk and Tesla) the role's dashed line runs on top of the holding's solid one — one two-tone line — and one label names both (`Board Member · CEO · 18.4%`). Every line's label sits in room kept above its company, beside the line rather than on it. A role never continues the tree: only ownership is followed further down.
- **Time travel**: in the panel's **Timeline** tab, click a year to see the graph and the panel as they stood at the **end of that year**; or pick one in the Filters panel's **Year** list (every year back to the earliest the company's history mentions; "Present" takes you back). The Filters button then reads "Filters · 2019", and the Year row explains the dimmed lines. The chosen year stays while you navigate and expand, and lives in the URL (`#graph/e/<id>/asof/2019-12-31`), so Back walks between past and present and the link can be shared. A relationship whose stated start is later, or that had ended by then, is not shown; one the sources only confirm later (a subsidiary first listed in 2023, a 13F holding) is shown **dashed and faded** rather than hidden — "not documented for that year", never "did not exist". A company founded after that year is not shown at all.

### Node detail panel
- **Entity panel**: shows company logo (fetched from Wikidata via P154/P18 → Wikimedia Commons), ownership badges, subsidiaries, executives, **succession** links (*Succeeded by* / *Formerly*, e.g. Twitter → X Corp.), and a link to Wikipedia. Entities collapsed from several BODS filings (an id-less party re-declared per controlled company) list every declaring **source statement** id, so per-statement provenance stays visible after the merge
- **Person graph**: the companies a person owns (owns edges, stake-labelled) and the companies they currently **lead** — one dashed role edge per company, labelled with the roles ("CEO · Chairman · President"); ended roles stay in the panel only. The minimum-stake filter never hides a role edge, so an executive without a disclosed stake is not a lone node. Company graphs stay ownership-only: their executives are listed in the panel, not drawn.
- **Person panel**: shows person photo (fetched from Wikipedia REST API, falls back to name search), nationality, **place of birth**, the **positions** they hold and **ownership stakes** they own, the **sources** behind those facts, and a Wikipedia link
- **Actions live in the panel.** A ⋮ beside a company or person name opens **Share** and **Report**;
  right-clicking (or long-pressing, on touch) a relationship row opens **Report relationship** and
  **View source**, which goes to the register record that asserted *that* relationship. Under the
  name sits the "disputed" badge, and — for a moderator, and only when this record actually has
  reports waiting — the way into the flag queue, scoped to **this** company and every relationship
  at either end of it. The full queue, every company, is the first thing a moderator sees in **Settings** (a *Moderation* group above everything else), paged. There are no
  floating buttons
- **Type markers**: every row in the relationship lists (owners, subsidiaries, executives, dual-listed, succession) carries a small coloured marker matching the node's colour in the graph — round for a person, rounded-square for an entity. The palette lives once in `src/utils/entityColors.ts` and is read by the graph, the legend, the map panel and the scraper results, so they cannot drift.
- **Long subsidiary lists are grouped** by how the holding is held — *Direct holdings* open, *Held indirectly* and *Relationship not stated* collapsed — once a list exceeds 12 and actually splits. Section headers carry the true count from the server, which matters because sections are capped and a rendered list can be shorter than reality (Barclays: 118 subsidiaries).
- **The graph omits ownership shortcuts that are proven redundant.** GLEIF records "X is the ultimate parent of Y" alongside the chain that already links them, and drawn, that shortcut is indistinguishable from a direct holding. But not all are redundant — for 58 of 484 owned entities the ultimate-parent edge is the *only* inbound ownership there is. A backend maintenance pass marks the genuinely redundant ones (`shortcut`), and only those are hidden; anything unproven is drawn. A surviving ultimate-parent link is drawn **dashed**, since it is still not a direct holding.
- **Overview / Timeline tabs** for entities
- **Export as PNG** (panel menu): the whole graph at 2× in a frame of its own background, with a header band — the logo, the name and the subtitle on the left, the **company and the date** (and "As of {year}" when the graph is a past one) on the right — and a footer band: a **legend of what the picture draws** (only the node types and line kinds in it, the ⓘ panel's colours) on the left; on the right **what it leaves out** (`Subsidiaries: Direct · Minimum stake: ≥1%`) over the **link to the live graph**. A picture pasted into a deck then says what it shows, what it hides and where it came from — filtered to ≥ 5 %, it used to look like the whole company. **Export as spreadsheet (.ods)** asks the server for the open company's workbook — Overview, Owners, Subsidiaries, Roles, Timeline, Sources, Claims — as of the day, with the levels and the stake band the graph shows, but **every row**, not what the graph loaded (it replaced a CSV built from the graph's elements: two tables in one file, every number a string); the file is named by the server (`Microsoft as of 2019.ods`)
- **Timeline for people too**, built from the positions and holdings the panel already fetched — Steve Jobs founding Apple in 1976, off the board in 1985, back in 1997, CEO until 2011. Grouped by year, newest first, with undated entries in their own group rather than given an invented date (a role from Wikidata's reverse lookup carries none). The tab appears only when something is dated: about half the people in the graph have no dated position, and a tab that always opens onto "no date recorded" is worse than no tab

### Timeline view
- Shows ownership changes, subsidiaries acquired, and executive roles grouped by year
- Undated relationships appear under "No date recorded"

### Map view
- World SVG map with countries shaded by how many companies they hold
- **Registered / Headquarters** switch on the map — where a company is legally registered versus where it is actually run. No fallback between them: a company with no recorded HQ is counted as "Not recorded" rather than shown under its registration country
- With a company selected, the panel header names it, its country, and **the full address the pin
  is standing on** — the registered office under Registered, the headquarters street under
  Headquarters. No fallback between them: captioning a Cayman pin with a London street would
  contradict the pin itself
- With a company selected, its **pin follows the basis**: the headquarters (amber) or the
  registered office (violet), which for an offshore company is its agent's door — Barclays Capital
  (Cayman) sits on Grand Cayman under Registered and in London under Headquarters. No fallback
  between them: where that basis has no coordinates there is no pin, only the country shading —
  and a **hollow ring at the country's centre**, so a highlighted country too small to see
  (Switzerland on the world, Bermuda, Singapore) is still found; a parent and a subsidiary in the
  same unplaced country get two rings fanned apart. The ring's tooltip (tap it on a phone) names
  the company and the country
- With a company selected the map is **fitted to every highlighted country** — the company and
  its subsidiaries, each at its pin or its country's centre — as close as that allows and no closer
  than one company alone is shown; a spread too wide for the frame shows the whole world. A company
  whose country is not even known leaves the view where it is
- Scroll to zoom, drag to pan, reset button top-right
- Click a country → left panel shows its entity list; click an entity to load it into the graph

#### Subdivisions

Countries that state an ISO 3166-2 jurisdiction (`US-DE`) can be broken down further. In practice
that means the US and Canada: about 1% of GLEIF records carry one, and **35 of the 47 American
companies in the dev graph are registered in Delaware** — the thing a country-level map cannot say.

- A country with subdivisions gets a chevron in the country list; expanded, it lists them
  biggest-first, plus a "Not stated" row for the remainder so the numbers add up
- Clicking such a country on the map drills into its **state map** (`geoAlbersUsa`), coloured on
  its own scale — one country concentrates far harder than the world does
- Canada gets the list breakdown but no state map: there is no bundled Canadian geometry
- The node panel shows **Registered in Delaware** where the source states one
- Subdivisions belong to the registration basis; under Headquarters they disappear

Subdivision names are English only — `Intl.DisplayNames` has no `subdivision` type, so there is
nothing to localise from.

#### Map geometry

All geometry is bundled (npm dependency, never a CDN): the CSP blocks other hosts and the Android
build has to draw a map offline. `countries-110m` (106 kB) is imported statically for the first
paint; `countries-50m` (739 kB) and `us-atlas/states-10m` (112 kB) load lazily from
`utils/mapGeography.ts`, so they stay out of the entry chunk and cost nothing to anyone who never
opens the map. Check `npm run build` output if you touch this — a lazy import that silently
becomes a static one shows up only as a bigger `index-*.js`.

### Scraper panel (graduated by role)

The tab is visible to everyone, but each section only appears for roles the API would actually let act on it — the predicates live in `src/utils/scrapeAccess.ts` and mirror the backend's guards. A section that 403s is worse than one that isn't shown.

| Section | Who sees it |
|---|---|
| Status header, **Recent activity** | everyone, including logged-out visitors |
| Run form, source selector, per-source toggles, **Review duplicate persons** | contributor, admin |
| **BODS bulk import** notes, **Federation panel** | admin |

Order top to bottom: status header → recent activity → run controls → bulk datasets → federation, so the read-only content everyone can use comes before the controls most visitors can't.

Visitors get a plain description of what the project is (the signed-in blurb describes importing, which they cannot do), plus a **source catalogue**: every source the platform draws on, with its own link, a short description, and a reliability band with its ranking score. The catalogue is public — where the data comes from is the case for the whole platform. The same Data tab carries the **Help — reading the graph** glossary (node colours, dimmed entries, corroboration badges, edge widths) above the source cards, next to the data it explains.

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
- **Scraper → Weekly report** (admins): the weekly activity digest — searches (per-week totals, top queries, how many found nothing), scrapes (companies scraped for the first time vs refreshed, records written, failures), imports, and graph totals with the change since the previous week; ‹ › walks back through stored weeks. The same numbers the Monday email carries (`GET /analytics/weekly`).
- **Settings → Feedback & legal**: a feedback mailto (shown only when `VITE_FEEDBACK_EMAIL` is set at build time) and the links to the legal pages (privacy, imprint, terms, data sources)
- **Settings → Delete account** permanently deletes your own account (password required, two-step confirm) and signs you out. Required by both app stores for any app with account creation, and the route for a GDPR erasure request. Reports you filed are kept but anonymised; the backend refuses for the `ADMIN_EMAIL` bootstrap account and for the last remaining admin, and shows its reason.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | *(required in a production build)* | Backend **origin**, e.g. `https://api-dev.owlgraph.org`. The `/v1` prefix is appended in `services/api.ts`, so don't include it here or requests go to `/v1/v1`. A production build with this unset **throws at startup** rather than falling back — a silent fallback once meant a build could read and write the wrong environment. `npm run dev` falls back to the dev API. |

---

## Deployment

The app is deployed on Render as a static site built from this repo. Render runs `npm run build` and serves `dist/`. Any push to **`develop`** triggers a redeploy.

### Installed app: minimum version check

The Android app is a native shell that loads the deployed site, so its web code is
always current — what can go stale is the **shell** (plugins, WebView settings). At
start, and when it returns to the foreground (at most hourly), the app asks the
backend's unversioned `GET /app-version?platform=android&version=<installed>` and:

- **update required** → a full-screen *Update required* screen with no way past it
  (the backend only says this when that build must not keep running);
- **update available** → a banner with *Update* / *Later* (*Later* is remembered per
  offered version).

The server decides and the client fails open: no answer, a malformed answer, the web
app, and development builds (`0.0.0-dev…`) all mean "carry on". Only `https://`,
`market://` and `itms-apps://` store links are opened. Setting the policy is an admin
call on the backend (`PUT /app-version`, see its api-reference), e.g.:

```bash
curl -X PUT "$API/app-version" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"android": {"min_supported": "1.0.0", "latest": "1.1.0",
                   "store_url": "https://play.google.com/store/apps/details?id=org.owlgraph.app"}}'
```

It is a full replace per call — send every platform you want kept.

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

## Releases & versions

**One product version for the API, the web app and the Android app**, in semantic
versioning (`major.minor.patch`), starting at `1.0.0`. The **git tag is the only place
the number lives** — `package.json` stays at `0.0.0` and nothing else in either repo
carries it, so the three numbers that used to disagree (API 0.1.0, web 0.2.0, Android
1.0) cannot drift apart again.

- **A release is a tag `vX.Y.Z` on `main`, with the same number in both repos**
  (`~/scripts/release.sh X.Y.Z` tags both after checking they are ready). Tagging
  triggers `.github/workflows/release.yml` here (the production web build, attached
  to a GitHub release with notes from the merged PRs) and in pamten-backend (the API
  image `ghcr.io/<owner>/pamten-backend:X.Y.Z`), plus `android.yml` (the APK).
  A tag that is not `vMAJOR.MINOR.PATCH`, or not on `main`, fails the workflows.
- **Everything else is a development build** and says so: `0.0.0-dev+<commit>` —
  Render's dev deploys, local builds, tests.
- **Where to see it:** Settings shows *Version X*; the page carries
  `<meta name="app-version" content="X">` (`curl -s <site> | grep app-version`);
  the API reports it on `/` and in `/docs`.
- **Android build number** (Play requires it to grow): `major·10000 + minor·100 + patch`,
  so minor and patch stay ≤ 99 — the build refuses otherwise instead of colliding.
- **`/v1` is not the product version.** The API path changes only when old clients
  would break; the minimum-app-version switch (`/app-version`) decides which shipped
  apps may still run.
- **Repository settings the release build needs** (Actions variables/secrets):
  `PROD_API_URL` (required — baked into the bundle), `FEEDBACK_EMAIL` (optional),
  secrets `LEGAL_NAME`, `LEGAL_ADDRESS`, `LEGAL_EMAIL` (the build fails without them).
- The resolver is `scripts/app-version.mjs` (`--check`, `--code`), shared by Vite,
  the workflows and Gradle.

## Licence

Source code: [MIT Licence](LICENSE)

The database content served by the Pamten API is licensed
under [ODbL v1.0](https://opendatacommons.org/licenses/odbl/1-0/).

Built with assistance from Claude by Anthropic and Claude Code CLI.
