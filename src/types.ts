// Entity types
export type EntityType = 'company' | 'brand' | 'holding' | 'person'

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

export interface Location {
  id: string
  street?: string
  city?: string
  state?: string
  zip?: string
  country: string
  country_full?: string
  region?: string
  latitude?: number
  longitude?: number
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
  stake_percent?: number | null
  voting_power_pct?: number | null
  ownership_type?: OwnershipType | null
  since?: string | null
  until?: string | null
  value_usd?: number
  source_id?: string
  credibility_score?: number
}

export interface RoleRelationship {
  role: RoleType
  since?: string | null
  until?: string | null
  source_id?: string
  credibility_score?: number
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

export interface FullProfile {
  entity: Entity
  headquarters?: Location | null
  operations: Location[]
  owners: OwnerEntry[]
  subsidiaries: SubsidiaryEntry[]
  executives: ExecutiveEntry[]
  dual_listed?: Entity[]   // paired legal entities of a dual-listed company
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
  edgeType: 'owns' | 'role' | 'votes'
  edgeDir?: 'in' | 'out'
  ownershipType?: OwnershipType | string | null
  votingPowerPct?: number | null
  stakePct?: number | null
}

export type GraphElement =
  | { data: NodeData }
  | { data: EdgeData }

// Auth types
export interface AuthUser {
  id: string
  email: string
  role: 'admin' | 'moderator' | 'contributor' | 'viewer'
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

export interface BodsImportResult {
  status: string
  source: string
  entities: number
  persons: number
  relationships: number
  skipped: number
  errors: number
}

// Country map types
export interface CountryEntityGroup {
  country: string
  count: number
  entities?: Entity[]  // loaded lazily when a country is selected
}

export interface ContextCountry {
  country: string        // alpha-2 or full name
  role: 'primary' | 'subsidiary'
  lat?: number           // hq_lat if available
  lng?: number           // hq_lng if available
  label: string          // entity name for tooltip
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
