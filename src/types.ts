// Entity types
export type EntityType = 'company' | 'brand' | 'holding' | 'government' | 'foundation' | 'fund' | 'nonprofit' | 'person' | 'voting_group'

export type OwnershipType =
  | 'full'
  | 'majority'
  | 'minority'
  | 'controlling'
  | 'partnership'
  | 'passive'
  | 'active'
  | 'unknown'

export type RoleType = string

export type SourceType =
  | 'news'
  | 'register'
  | 'wikipedia'
  | 'user'
  | 'scraper'

// Node types
export interface Entity {
  id: string
  name: string
  type: EntityType
  country?: string
  founded?: number
  revenue?: number
  employees?: number
  employees_as_of?: number
  description?: string
  verified: boolean
  wikidata_id?: string
  sec_cik?: string
  hq_country?: string
  hq_city?: string
  hq_lat?: number
  hq_lng?: number
  countries?: string[]      // all domiciles (dual-listed companies have >1)
  hq_locations?: string[]   // all HQs as "City|CC" strings
  source_statement_ids?: string[]  // BODS statement ids that declared this entity (>1 ⇒ collapsed from several filings)
  is_nominee?: boolean      // holder of record (nominee/custodian), not a beneficial owner
  // GLEIF LEI-CDF detail fields (surfaced in the node Details section)
  legal_form?: string       // resolved ISO 20275 ELF name, e.g. "Private Limited Company"
  registration_authority?: string  // register name, e.g. "Companies Register"
  registration_number?: string     // the entity's id at that authority
  address?: string          // human-readable registered (legal) address
  registered_address?: string  // normalized registered office (PSC/company-data)
  hq_address?: string       // full HQ address (map pin is geocoded from this)
  hq_geo_precision?: string  // 'exact' | 'approx' — how precisely hq_lat/hq_lng was geocoded
  reg_lat?: number          // the REGISTERED office, geocoded from `address` — an offshore
  reg_lng?: number          // company's agent's door, which is not where it is run
  reg_geo_precision?: string
  jurisdiction_code?: string  // ISO 3166-2 registration, e.g. 'US-DE' — sparse; absent means "not stated"
  founded_date?: string     // full YYYY-MM-DD incorporation/creation date (headline `founded` stays the year)
  // GLEIF Level 2 *reporting exceptions* — why the company names no parent. An LEI
  // holder must report its parent or file a reason, so these say "asked and declined",
  // which is a different fact from having no parent recorded at all. Direct and
  // ultimate are separate questions with separate answers. Comma-joined when a filer
  // gives more than one reason; the `_reference` is free text, often a URL pointing at
  // the parent it would not name.
  no_direct_parent_reason?: string
  no_ultimate_parent_reason?: string
  no_direct_parent_reason_reference?: string
  no_ultimate_parent_reason_reference?: string
}

export interface Person {
  id: string
  first_name: string
  last_name: string
  full_name: string
  alias?: string[]
  nationality?: string
  nationalities?: string[]
  birth_date?: string
  death_date?: string
  birth_place?: string
  description?: string
  wikipedia_url?: string
  verified: boolean
}

export interface Source {
  id: string
  name: string
  url?: string
  credibility_score: number
  type: SourceType
  // Per-entry provenance (for later verification, e.g. by journalists):
  source_date?: string      // date the fact was recorded/published in the source
  last_scraped_at?: string  // when we last confirmed it against the source
}

// Relationship types
export interface OwnsRelationship {
  /** Which security this percentage is a percentage OF — from the filing's
   *  cover page. Absent on pre-2024 SEC filings and on non-SEC sources. */
  share_class?: string | null
  /** When the record behind this edge was filed/published by its source. */
  source_date?: string | null
  /** The counts behind the percentage: a stake is `shares / shares_outstanding`.
   *  Kept because a count is what the filing states, while a percentage is a
   *  division against a denominator that moves — Bevco's went stale when AB
   *  InBev issued more shares, though its holding never changed. */
  shares?: number | null
  shares_outstanding?: number | null
  /** Set by the backend staleness pass: a community-tier assertion nothing has
   *  re-confirmed for months. Wikidata has no retirement signal — a deleted
   *  statement just stops being seen — so age is the only evidence, and it is
   *  weak evidence, which is why this dims the row rather than removing it. */
  stale?: boolean | null
  /** GLEIF RR: 'direct' = the immediate parent, 'indirect' = the ultimate parent
   *  (a shortcut edge duplicating a path the graph already contains). Absent on
   *  Wikidata and SEC edges, which never state the distinction. */
  direct_or_indirect?: 'direct' | 'indirect' | null
  /** Set by the backend maintenance pass: this indirect edge is redundant because
   *  a pure-direct chain already reaches the same company, so the graph can omit
   *  it. Absent means unproven — always drawn. */
  shortcut?: boolean | null
  stake_percent?: number | null
  voting_power_pct?: number | null
  ownership_type?: OwnershipType | null
  since?: string | null
  until?: string | null
  value_usd?: number
  source_id?: string
  credibility_score?: number
  source_url?: string | null   // deep link to the record that asserted it
  /** How many distinct sources assert this relationship (from the claims table),
   *  and their names. 0 + [] means "no claim rows" — edges older than claims —
   *  which is different from unknown, so the backend always sends both. */
  corroborations?: number
  asserted_by?: string[]
}

export interface RoleRelationship {
  role: RoleType
  since?: string | null
  until?: string | null
  source_id?: string
  credibility_score?: number
  source_url?: string | null   // deep link to the record that asserted it
  /** How many distinct sources assert this relationship (from the claims table),
   *  and their names. 0 + [] means "no claim rows" — edges older than claims —
   *  which is different from unknown, so the backend always sends both. */
  corroborations?: number
  asserted_by?: string[]
}

// API response types
export interface SearchResult {
  node: Entity | Person
  score: number
  type: 'Entity' | 'Person'
}

export interface OwnerEntry {
  owner: Entity | Person
  relationship: OwnsRelationship
}

export interface SubsidiaryEntry {
  entity: Entity
  relationship: OwnsRelationship
}

export interface ExecutiveEntry {
  person: Person
  role: RoleRelationship
}

/** True section sizes, independent of the per-section row limit. */
export interface ProfileCounts {
  owners?: number | null
  subsidiaries?: number | null
  executives?: number | null
  dual_listed?: number | null
  succeeded_by?: number | null
  replaces?: number | null
}

export interface FullProfile {
  entity: Entity
  counts?: ProfileCounts
  owners: OwnerEntry[]
  subsidiaries: SubsidiaryEntry[]
  executives: ExecutiveEntry[]
  dual_listed?: Entity[]              // paired legal entities of a dual-listed company
  succeeded_by?: SuccessionEntry[]    // entities this one was replaced by (Twitter → X Corp.)
  replaces?: SuccessionEntry[]        // entities this one replaced (its predecessors)
  ownership?: OwnershipSummary        // computed free-float residual + data-quality flag
  cross_holdings?: Entity[]           // entities in a reciprocal (circular) ownership with this one
  /** Parties to a filing group. Only present on a voting_group entity. */
  group_members?: GroupParty[]
  /** The filing groups this entity is a party to — the mirror of the above,
   *  present on a member's profile so the graph can draw the bloc it votes in. */
  voting_groups?: { group: Entity }[]
}

// Derived (not sourced) ownership breakdown, computed on read from the owners.
export interface OwnershipSummary {
  disclosed_pct?: number | null   // sum of disclosed stakes
  free_float_pct?: number | null  // 100 − disclosed, when every owner's stake is known
  unknown_owners?: number         // owners with an unknown %
  exceeds_100?: boolean           // disclosed stakes sum past 100% (overlapping sources/dates)
  /** The filings name more than one security, so their percentages measure
   *  different wholes and no single total is meaningful. `disclosed_pct` is
   *  null when this is set; `by_class` carries the per-security totals. */
  multi_class?: boolean
  by_class?: ShareClassTotal[]
}

/** Disclosed ownership of ONE security. A 13D/G percentage is always a percent
 *  of a class, so a company with several classes has several denominators. */
export interface ShareClassTotal {
  share_class?: string | null     // null = the filing did not name one
  disclosed_pct: number
  owners: number
}

/** A party to a filing group. They join by RELATED_TO, not OWNS — membership is
 *  not ownership — so they arrive in their own list rather than among owners. */
export interface GroupParty {
  /** Either shape — a member may be a company or a human being, and the filing
   *  says which via `kind`. Not `Entity & Partial<Person>`: that demands a
   *  `name` and a `type`, which a Person has neither of. */
  party: Partial<Entity> & Partial<Person> & { id: string }
  kind: 'entity' | 'person'
}

// A succession neighbour (predecessor/successor) plus when it took effect.
export interface SuccessionEntry extends Entity {
  since?: string   // succession date (Wikidata P585), e.g. "2023-04-00"
}

export interface PositionEntry {
  entity: Entity
  role: RoleRelationship
}

export interface HoldingEntry {
  entity: Entity
  relationship: OwnsRelationship
}

export interface PersonProfile {
  person: Person
  positions: PositionEntry[]   // HAS_ROLE → entity (CEO, Founder, Chairman, ...)
  holdings: HoldingEntry[]     // OWNS → entity
}

export interface HistoryEntry {
  owner?: Entity | Person
  entity?: Entity
  person?: Person
  relationship: OwnsRelationship | RoleRelationship
  active?: boolean
  type?: string
}

// Graph element types (Cytoscape)
export type NodeType = 'entity' | 'person'

export interface NodeData {
  id: string
  label: string
  nodeType: NodeType
  entitySubtype?: EntityType | null
  raw: Entity | Person
  importance?: number   // voting_power_pct or stake_percent — drives node size and arc radius
}

export interface EdgeData {
  id: string
  source: string
  target: string
  label: string
  edgeType: 'owns' | 'role' | 'votes' | 'member'
  edgeDir?: 'in' | 'out'
  ownershipType?: OwnershipType | string | null
  votingPowerPct?: number | null
  stakePct?: number | null
  /** 'indirect' here means an ultimate-parent link that survived the shortcut
   *  filter because nothing else reaches that company — drawn dashed, since it is
   *  still not a direct holding. */
  directOrIndirect?: string | null
}

export type GraphElement =
  | { data: NodeData }
  | { data: EdgeData }

// Auth types
export interface AuthUser {
  id: string
  email: string
  role: 'admin' | 'moderator' | 'contributor' | 'viewer'
  email_verified?: boolean
}

// Result of POST /scraper/ensure (on-demand enrichment).
export interface EnsureResult {
  scraped: boolean
  reason: string          // absent | never_on_demand | stale | deepen | forced | fresh | disabled | in_progress | cooldown | recently_missed
  /** What was found. A name can be a company or a person, and searching a
   *  person's name used to produce a company node for them. */
  kind?: 'entity' | 'person'
  entity_id: string | null
  person_id?: string | null
  depth_reached: number
  sources_run: string[]
  profile: FullProfile | PersonProfile | null
}

/** Narrow an ensure result to the person case — `kind` decides, and the profile
 *  shape follows from it. */
export function isPersonResult(
  r: EnsureResult,
): r is EnsureResult & { person_id: string; profile: PersonProfile } {
  return r.kind === 'person' && !!r.person_id && !!r.profile
}

export interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loading: boolean
}

// Scraper types
export interface ScraperSource {
  name: string
  description: string
  enabled: boolean
  /** "instant" = queried per company on demand; "bulk" = whole-dataset import. */
  kind?: 'instant' | 'bulk'
  label?: string          // display name, e.g. "SEC EDGAR"
  url?: string | null     // the source's own site
  /** 0-100 tie-breaker used to rank conflicting claims (see backend app/claims.py). */
  credibility?: number | null
  /** Band the credibility belongs to — what the UI shows alongside the number. */
  quality?: 'statutory' | 'official' | 'aggregated' | 'community' | null
}

export interface ScraperStatus {
  enabled: boolean
  wikidata_enabled?: boolean
  sec_edgar_enabled: boolean
  open_corporates_enabled: boolean
  bods_gleif_enabled?: boolean
  bods_uk_psc_enabled?: boolean
  geocoding_enabled?: boolean
  autodedup_enabled?: boolean
}

export interface DuplicateMember {
  id: string
  full_name: string
  wikidata_id?: string | null
  connected?: number
}

export interface DuplicateGroup {
  confidence: 'high' | 'medium' | 'low'
  likely_distinct?: boolean
  reason: string
  suggested_keep_id: string
  members: DuplicateMember[]
}

export interface DuplicateScan {
  count: number
  groups: DuplicateGroup[]
}

export interface DedupResult {
  applied: boolean
  merged_count: number
  review_count: number
  merged: Array<{ keep_id: string; keep_name: string; merged: string[] }>
  needs_review: DuplicateGroup[]
}

export interface KeptSeparatePair {
  a_id: string
  a_name: string
  b_id: string
  b_name: string
  at?: string | null
}

export interface KeptSeparateList {
  count: number
  pairs: KeptSeparatePair[]
}

export interface MergeLogEntry {
  id: string
  keep_id: string
  keep_name: string
  dup_name: string
  at?: string | null
  count?: number
}

export interface MergeLogList {
  count: number
  entries: MergeLogEntry[]
}

export interface FederationStatus {
  enabled: boolean
  entities: number
  persons: number
  ownerships: number
}

export interface FederationPeer {
  id: string
  name: string
  base_url: string
  credibility_score?: number
  enabled?: boolean
  has_token?: boolean
  has_public_key?: boolean
  created_at?: string
}

export interface FederationPublicKey {
  signing_enabled: boolean
  algorithm?: string
  public_key?: string
  key_id?: string
}

export interface PeerPullResult {
  peer: string
  verified: boolean
  imported: { entities: number; persons: number; ownerships: number; skipped: number }
  deduplication: { merged_count: number; review_count: number }
}

export interface ScrapeResult {
  status: string
  query?: string
  company?: string
  total: number
  scraped: Array<{ name: string; type: string }>
}

export interface ScrapeRun {
  id: string
  source: string
  target: string
  status: 'running' | 'ok' | 'failed'
  started_at: string
  finished_at?: string | null
  total: number
  error?: string
  stale?: boolean
}

// Country map types
export interface CountryEntityGroup {
  /** null is the "not recorded" group — companies with no country for the
   *  selected basis. They are counted rather than dropped, so the totals on the
   *  map add up; MapView skips them since they cannot be placed. */
  country: string | null
  count: number
  entities?: Entity[]  // loaded lazily when a country is selected
}

export interface ContextCountry {
  country: string        // alpha-2 or full name
  role: 'primary' | 'subsidiary'
  lat?: number           // coordinates for the SELECTED basis (hq_* or reg_*)
  lng?: number
  label: string          // entity name for tooltip
  city?: string          // hq_city — shown in the location detail popup (HQ basis only)
  hqAddress?: string     // the address the pin actually stands on, for the selected basis
  legalAddress?: string  // registered/legal address (shown as info when it differs)
  basis?: 'jurisdiction' | 'hq'   // which place this pin is, so it can be styled and labelled
  precise?: boolean      // geo precision 'exact' → pin vs approximate circle
}

// Toast
export type ToastVariant = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

// ── Verification flags (report a wrong node/edge) ───────────────────────────
export type FlagTargetKind = 'owns' | 'role' | 'entity' | 'person'
export type FlagCategory =
  | 'wrong-owner'
  | 'wrong-percent'
  | 'wrong-role'
  | 'not-real'
  | 'outdated'
  | 'duplicate'
  | 'other'

export interface FlagCreatePayload {
  target_kind: FlagTargetKind
  category: FlagCategory
  note?: string
  node_id?: string
  from_id?: string
  to_id?: string
  role?: string
}

export interface FlagSummary { open: number }
export interface FlagCreateResult { id: string; status: 'open' | 'duplicate' }

export type FlagStatus = 'open' | 'reviewing' | 'resolved' | 'rejected'

export interface Flag {
  id: string
  target_kind: FlagTargetKind
  category: FlagCategory
  note: string
  status: FlagStatus
  reporter_kind: 'user' | 'anon'
  from_id: string
  to_id: string
  role: string
  node_id: string
  created_at: string
  updated_at: string
}

export interface Suppression {
  id: string
  target_kind: FlagTargetKind
  from_id: string
  to_id: string
  role: string
  flag_id: string
  created_at: string
}

export interface Pin {
  id: string
  from_id: string
  to_id: string
  stake_percent: number | null
  ownership_type: string | null
  flag_id: string
  created_at: string
}

// A collapsed queue row: many reports of the same target+category as one entry.
export interface FlagGroup {
  target_kind: FlagTargetKind
  from_id: string
  to_id: string
  role: string
  node_id: string
  category: FlagCategory
  count: number
  flag_ids: string[]
  note: string
  created_at: string
}
