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
  description?: string
  verified: boolean
  wikidata_id?: string
  sec_cik?: string
  hq_country?: string
  hq_city?: string
  hq_lat?: number
  hq_lng?: number
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
  role: 'admin' | 'contributor' | 'viewer'
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
  sec_edgar_enabled: boolean
  open_corporates_enabled: boolean
  bods_gleif_enabled?: boolean
  bods_uk_psc_enabled?: boolean
}

export interface ScrapeResult {
  status: string
  query?: string
  company?: string
  total: number
  scraped: Array<{ name: string; type: string }>
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

// Toast
export type ToastVariant = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  message: string
  variant: ToastVariant
}
