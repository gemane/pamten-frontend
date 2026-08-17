import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FiMoreVertical, FiShare2, FiMapPin, FiCalendar, FiDollarSign, FiUsers, FiExternalLink, FiList, FiClock, FiDownload, FiShield, FiChevronRight, FiChevronDown, FiFlag, FiTag, FiBriefcase, FiHash } from 'react-icons/fi'
import { getFullProfile, getEntitySources, getPersonProfile, getPersonSources } from '../services/api'
import { countryName } from '../utils/isoCountries'
import { ageFrom } from '../utils/age'
import { isSubdivision, subdivisionName } from '../utils/isoSubdivisions'
import { colorFor, typeLabelKey } from '../utils/entityColors'
import OwnershipBadge from './OwnershipBadge'
import TimelinePanel  from './TimelinePanel'
import NodeFlags      from './NodeFlags'
import PersonTimeline, { hasDatedRows } from './PersonTimeline'
import ActionMenu     from './ActionMenu'
import ReportModal    from './ReportModal'
import { useLongPress } from '../hooks/useLongPress'
import type { NodeData, FullProfile, PersonProfile, Person, Entity, Source, SubsidiaryEntry } from '../types'

// Ordering helpers for the related-node lists (owners, subsidiaries, …), which
// otherwise render in arbitrary backend order.
// - byStakeDesc: largest ownership stake first (the most meaningful order for an
//   ownership map); rows with no known stake sort last, ties alphabetical.
// - byName: plain A→Z, for people/relationships without a stake.
export function byStakeDesc<T>(getStake: (x: T) => number | null | undefined, getName: (x: T) => string) {
  return (a: T, b: T) => {
    const sa = getStake(a), sb = getStake(b)
    if (sa != null && sb != null && sa !== sb) return sb - sa
    if (sa != null && sb == null) return -1
    if (sa == null && sb != null) return 1
    return getName(a).localeCompare(getName(b))
  }
}
function byName<T>(getName: (x: T) => string) {
  return (a: T, b: T) => getName(a).localeCompare(getName(b))
}

// Executive seniority: rank a role string by importance (CEO first, board/other
// last); the final tiebreak is always alphabetical by name. Matched on keywords
// so scraped variants ("Chief Executive Officer", "CEO", "Chairman"…) all land.
const ROLE_RANK: [RegExp, number][] = [
  [/chief exec|\bceo\b/i, 0],
  [/chair/i, 1],
  [/president/i, 2],
  [/chief financ|\bcfo\b/i, 3],
  [/chief operat|\bcoo\b/i, 4],
  [/chief|\bc[tio]o\b|\bcmo\b|officer/i, 5],
  [/managing director/i, 6],
  [/board|director|member/i, 7],
]
export function roleRank(role?: string | null): number {
  const r = role ?? ''
  for (const [re, rank] of ROLE_RANK) if (re.test(r)) return rank
  return ROLE_RANK.length + 1
}
export function byRoleImportance<T>(getRole: (x: T) => string | null | undefined, getName: (x: T) => string) {
  return (a: T, b: T) => {
    const ra = roleRank(getRole(a)), rb = roleRank(getRole(b))
    if (ra !== rb) return ra - rb
    // Same rank → group identical titles together (so all "Board Member"s sit
    // together, then all "Director"s, rather than interleaving by name)…
    const roleA = getRole(a) ?? '', roleB = getRole(b) ?? ''
    if (roleA !== roleB) return roleA.localeCompare(roleB)
    // …and alphabetical by name within each title.
    return getName(a).localeCompare(getName(b))
  }
}

// Build a NodeData (as the graph uses) from a related entity/person so the
// panel rows can navigate the same way clicking a graph node does.
export function entityToNode(e: Entity): NodeData {
  return { id: e.id, label: e.name, nodeType: 'entity', entitySubtype: e.type, raw: e }
}
export function personToNode(p: Person): NodeData {
  return { id: p.id, label: p.full_name, nodeType: 'person', raw: p }
}
export function ownerToNode(owner: Entity | Person): NodeData {
  return 'name' in owner ? entityToNode(owner) : personToNode(owner)
}

export function pickClaim(claims: Record<string, { rank: string; mainsnak: { datavalue?: { value: unknown } } }[]> | undefined, prop: string): string | null {
  const list = claims?.[prop]
  if (!list?.length) return null
  const preferred = list.find(c => c.rank === 'preferred') ?? list.find(c => c.rank === 'normal')
  return (preferred?.mainsnak?.datavalue?.value as string) ?? null
}

const PROV_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Format a provenance date/timestamp ('YYYY-MM-DD' or a full ISO string) into a
// short, timezone-independent label like "Feb 14, 2025". Returns null for empty
// or unparseable input so the caller can omit the line entirely.
export function formatProvenanceDate(value?: string | null): string | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return null
  const month = PROV_MONTHS[Number(m[2]) - 1]
  if (!month) return null
  return `${month} ${Number(m[3])}, ${m[1]}`
}

// Derive the display detail shown for a person (birth/death formatted, the
// nationality list resolved to localized names, and aliases). Kept pure and
// exported so it can be unit-tested without rendering.
export function personDisplayDetails(p: Person, lang: string) {
  const nationalities = (p.nationalities?.length ? p.nationalities
                        : (p.nationality ? [p.nationality] : []))
    .map(c => countryName(c, lang))
    .filter(Boolean)
  return {
    // A living person gets an age, not a birth date: it answers the question a
    // reader of an ownership graph actually has, and it is the smaller
    // disclosure about someone who never contacted us — the same fact, minus the
    // part that helps identify them. The date is still stored, and is still what
    // the age is computed from.
    //
    // Someone who has died keeps their dates. Those bound the period in which
    // they could have held or exercised control, which is what an ownership
    // record is read for; an age that changes every year cannot answer "who was
    // responsible for this company in 1985".
    age:  p.death_date ? null : ageFrom(p.birth_date),
    born: p.death_date ? formatProvenanceDate(p.birth_date) : null,
    died: formatProvenanceDate(p.death_date),
    nationalities,
    aka: (p.alias ?? []).filter(Boolean),
  }
}

function useWikidataImage(wikidataId: string | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!wikidataId) { setSrc(null); return }
    setSrc(null)
    fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidataId}&props=claims&format=json&origin=*`)
      .then(r => r.json())
      .then(data => {
        const claims = data?.entities?.[wikidataId]?.claims
        if (!claims) return
        for (const prop of ['P154', 'P18']) {
          const val = pickClaim(claims, prop)
          if (val) {
            const filename = val.replace(/ /g, '_')
            setSrc(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=200`)
            return
          }
        }
      })
      .catch(() => {})
  }, [wikidataId])
  return src
}

function usePersonImage(fullName: string | undefined, wikipediaUrl?: string): string | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    setSrc(null)
    if (!fullName && !wikipediaUrl) return

    const tryTitle = (title: string) =>
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
        .then(r => { if (!r.ok) throw new Error('not found'); return r.json() })
        .then((data): string | null => data?.thumbnail?.source ?? null)
        .catch((): null => null)

    ;(async () => {
      // 1. If we have a direct Wikipedia URL, use it
      if (wikipediaUrl) {
        const m = wikipediaUrl.match(/\/wiki\/([^#?]+)/)
        if (m) {
          const img = await tryTitle(m[1])
          if (img) { setSrc(img); return }
        }
      }
      // 2. Fall back to person's full name as the page title
      if (fullName) {
        const img = await tryTitle(fullName.replace(/\s+/g, '_'))
        if (img) setSrc(img)
      }
    })()
  }, [fullName, wikipediaUrl])
  return src
}

/** The ⋮ beside a name: share this view, or report this company or person.
 *
 *  Sharing reads the URL rather than the node, because the hash already encodes
 *  which node is open — the same link the reader has in their address bar. */
function NodeActions({ label, nodeId, targetKind, onShare }: {
  label: string
  nodeId: string
  targetKind: 'entity' | 'person'
  onShare?: () => void
}) {
  const { t } = useTranslation()
  const [reporting, setReporting] = useState(false)
  const items = [
    ...(onShare ? [{ key: 'share', label: t('menu.share'), icon: <FiShare2 size={13} />,
                     onSelect: onShare }] : []),
    { key: 'report', label: t('menu.report'), icon: <FiFlag size={13} />,
      onSelect: () => setReporting(true) },
  ]
  return (
    <>
      <ActionMenu items={items} triggerLabel={t('menu.actions')} trigger={<FiMoreVertical />} />
      {reporting && (
        <ReportModal targetKind={targetKind} targetLabel={label} nodeId={nodeId}
                     onClose={() => setReporting(false)} />
      )}
    </>
  )
}

interface NodePanelProps {
  node: NodeData | null
  onExportPng?: () => void
  onExportCsv?: () => void
  onViewOnMap?: () => void
  onShare?: () => void
  onNavigate?: (node: NodeData) => void
  // Force a fresh scrape of this company (verified users only — App passes undefined otherwise).
  onReScrape?: (node: NodeData) => void
  // Bumped by App when an on-demand scrape appends data → refetch this node's profile in
  // place (the effect is keyed on node.id, which doesn't change when the same node is enriched).
  refreshKey?: number
}



interface MetaRowProps {
  icon: React.ElementType
  label: string
  value?: string | number | null
}

function MetaRow({ icon: Icon, label, value }: MetaRowProps) {
  if (!value) return null
  return (
    <div className="meta-row">
      <Icon className="meta-icon" />
      <span className="meta-label">{label}</span>
      <span className="meta-value">{value}</span>
    </div>
  )
}

function Section({ title, count, children }: {
  title: string
  /** True total from the server. Not the child count: sections are capped, so what
   *  is rendered can be fewer than what exists. */
  count?: number | null
  children: React.ReactNode
}) {
  return (
    <div className="panel-section">
      <h4 className="panel-section__title">
        {title}{count != null && <span className="panel-section__count">{count}</span>}
      </h4>
      {children}
    </div>
  )
}

/** Below this, grouping costs more than it gives — three subsidiaries do not need
 *  three headings. Barclays (118) and Unilever (112) are the cases it exists for. */
const GROUPING_THRESHOLD = 12

function CollapsibleSection({ title, count, defaultOpen = false, children }: {
  title: string
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="panel-section">
      <button
        type="button"
        className="panel-section__toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {open ? <FiChevronDown size={12} /> : <FiChevronRight size={12} />}
        <span className="panel-section__title panel-section__title--inline">{title}</span>
        {count != null && <span className="panel-section__count">{count}</span>}
      </button>
      {open && children}
    </div>
  )
}

// The extra factual rows shown in the collapsible "Details" section, in display
// order, skipping any the entity doesn't have. Pure (no i18n/React) so it's unit
// tested directly; `labelKey` maps to a `panel.*` translation. Easy to extend with
// more detail fields later — add an entry here.
export interface DetailRow { icon: React.ElementType; labelKey: string; value: string }
export function entityDetailRows(entity: Entity): DetailRow[] {
  const registeredAt = [entity.registration_authority, entity.registration_number]
    .filter(Boolean).join(' · ')
  const candidates: { icon: React.ElementType; labelKey: string; value?: string | null }[] = [
    { icon: FiBriefcase, labelKey: 'panel.legalForm',    value: entity.legal_form },
    { icon: FiHash,      labelKey: 'panel.registeredAt', value: registeredAt || null },
    { icon: FiCalendar,  labelKey: 'panel.founded',      value: entity.founded_date },
    { icon: FiMapPin,    labelKey: 'panel.regAddress',   value: entity.address },
  ]
  return candidates.filter((r): r is DetailRow => !!r.value)
}

// Collapsible "Details" — a small container for factual fields (legal form, where the
// entity is registered, its registered address) that aren't part of the primary meta
// or the relationship sections. Hidden entirely when the entity has none of them.
function DetailsSection({ entity }: { entity: Entity }) {
  const { t } = useTranslation()
  const rows = entityDetailRows(entity)
  if (!rows.length) return null
  return (
    <CollapsibleSection title={t('panel.details')}>
      <div className="panel-meta">
        {rows.map((r, i) => <MetaRow key={i} icon={r.icon} label={t(r.labelKey)} value={r.value} />)}
      </div>
    </CollapsibleSection>
  )
}

function PersonView({ node, onNavigate, onShare, onReScrape }: {
  node: NodeData
  onNavigate?: (n: NodeData) => void
  onShare?: () => void
  onReScrape?: (node: NodeData) => void
}) {
  const raw = node.raw as Person
  const { t, i18n } = useTranslation()
  const imgSrc = usePersonImage(raw.full_name, raw.wikipedia_url)
  const { age, born, died, nationalities, aka } = personDisplayDetails(raw, i18n.language)

  // A person's positions (HAS_ROLE) and ownerships (OWNS) already exist in the
  // graph — fetch them so the panel shows what they hold, not just their bio.
  const [profile, setProfile] = useState<PersonProfile | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  useEffect(() => {
    let active = true
    setProfile(null)
    setSources([])
    getPersonProfile(node.id)
      .then(({ data }) => { if (active) setProfile(data) })
      .catch(() => { if (active) setProfile(null) })
    getPersonSources(node.id)
      .then(({ data }) => { if (active) setSources(data) })
      .catch(() => { if (active) setSources([]) })
    return () => { active = false }
  }, [node.id])
  const positions = profile?.positions ?? []
  const holdings  = profile?.holdings  ?? []
  const [activeView, setActiveView] = useState<string>('overview')
  // Only offer the timeline when something is dated. Roughly half the people in
  // the graph have no dated position at all — their roles come from a reverse
  // lookup that carries none — and an empty tab on every one of them is worse
  // than no tab.
  const showTimeline = hasDatedRows(profile)

  return (
    <div className="panel-body">
      {imgSrc && (
        <img className="panel-avatar" src={imgSrc} alt={raw.full_name} />
      )}
      <span className="node-type-badge node-type-badge--person">{t('legend.person')}</span>
      <div className="panel-header-row">
        <h2 className="panel-name">{raw.full_name}</h2>
        {/* Share and report live here now: one ⋮ beside the name, rather than a
          share button in the header, another floating on mobile, and a Report
          button of its own. */}
        <NodeActions label={raw.full_name} nodeId={node.id} targetKind="person" onShare={onShare} />
      </div>
      <NodeFlags nodeId={node.id} targetKind="person" label={raw.full_name} />
      {raw.description && <p className="panel-desc">{raw.description}</p>}
      <div className="panel-meta">
        <MetaRow icon={FiCalendar} label={t('panel.age')}
                 value={age !== null ? t('panel.years', { count: age }) : null} />
        <MetaRow icon={FiCalendar} label={t('panel.born')} value={born} />
        <MetaRow icon={FiMapPin} label={t('panel.birthPlace')} value={raw.birth_place} />
        <MetaRow icon={FiCalendar} label={t('panel.died')} value={died} />
        <MetaRow
          icon={FiFlag}
          label={nationalities.length > 1 ? t('panel.nationalities') : t('panel.nationality')}
          value={nationalities.join(', ') || null}
        />
        <MetaRow icon={FiTag} label={t('panel.alsoKnownAs')} value={aka.length ? aka.join(', ') : null} />
      </div>

      {showTimeline && <PanelTabs active={activeView} onChange={setActiveView} />}

      {showTimeline && activeView === 'timeline' && profile && (
        <PersonTimeline profile={profile} />
      )}

      {activeView === 'overview' && positions.length > 0 && (
        <Section title={t('panel.positions')}>
          {[...positions].sort(byName(p => p.entity?.name ?? '')).map((p, i) => (
            <RelRow key={i} node={entityToNode(p.entity)} onNavigate={onNavigate}
              rel={{ targetKind: 'role', fromId: node.id, toId: p.entity.id,
                     role: p.role?.role, label: p.entity.name,
                     sourceUrl: p.role?.source_url }}>
              <span className="rel-item__name">{p.entity.name}</span>
              <span className="role-badge">{p.role?.role}</span>
            </RelRow>
          ))}
        </Section>
      )}

      {activeView === 'overview' && holdings.length > 0 && (
        <Section title={t('panel.ownerships')}>
          {[...holdings].sort(byStakeDesc(h => h.relationship?.stake_percent, h => h.entity?.name ?? '')).map((h, i) => (
            <RelRow key={i} node={entityToNode(h.entity)} onNavigate={onNavigate}
              rel={{ targetKind: 'owns', fromId: node.id, toId: h.entity.id,
                     label: h.entity.name, sourceUrl: h.relationship?.source_url }}>
              <span className="rel-item__name">{h.entity.name}</span>
              <OwnershipBadge
                type={h.relationship?.ownership_type}
                percent={h.relationship?.stake_percent}
                votingPct={h.relationship?.voting_power_pct}
              />
            </RelRow>
          ))}
        </Section>
      )}

      {activeView === 'overview' && raw.wikipedia_url && (
        <a className="panel-link" href={raw.wikipedia_url} target="_blank" rel="noreferrer">
          <FiExternalLink /> {t('panel.wikipedia')}
        </a>
      )}

      {/* People can be scraped now, so they can be refreshed — the same control
          the company panel has, and it was missing here purely because until
          recently there was nothing behind it for a person. */}
      {onReScrape && (
        <div className="panel-rescrape">
          <button type="button" className="panel-rescrape__btn"
                  title={t('panel.reScrapeTitle')} onClick={() => onReScrape(node)}>
            {t('panel.reScrape')}
          </button>
        </div>
      )}

      <SourcesSection sources={sources} />
    </div>
  )
}

// A relationship row. Clickable (navigates like a graph node) when onNavigate
// and a resolvable target node are provided; otherwise a plain row. An optional
// `action` (e.g. the edge report button) is rendered beside the row — a sibling,
// not nested inside the clickable <button>, so the markup stays valid.
/** The coloured type marker shown before a related node's name.
 *
 *  Same palette as the graph, so a fund is the same gold in both. Round for a
 *  person, rounded-square for an entity, mirroring the graph's ellipse vs
 *  roundrectangle — the shape matters because person-green against
 *  government-red is the classic red/green confusion pair, and colour alone
 *  would leave those readers with no distinction at all. The title gives the
 *  same information as text. */
function TypeMarker({ node }: { node: NodeData }) {
  const { t } = useTranslation()
  const { fill, border } = colorFor(node.nodeType, node.entitySubtype)
  const label = t(typeLabelKey(node.nodeType, node.entitySubtype))
  return (
    <span
      className={`rel-item__marker${node.nodeType === 'person' ? ' rel-item__marker--person' : ''}`}
      style={{ background: fill, borderColor: border }}
      title={label}
      aria-label={label}
      data-testid="type-marker"
    />
  )
}

/** What a relationship row can be asked about: report it, or go to the record
 *  that asserted it. Identified by the natural key the flag system uses
 *  (from → to [+ role]) rather than any generated id, so a report survives a
 *  re-scrape. */
export interface RelTarget {
  targetKind: 'owns' | 'role'
  fromId: string
  toId: string
  role?: string
  label: string
  sourceUrl?: string | null
}

function RelRow({ node, onNavigate, rel, children }: {
  node: NodeData | null
  onNavigate?: (n: NodeData) => void
  rel?: RelTarget
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
  const [reporting, setReporting] = useState(false)
  // Unconditional: a hook cannot be called behind an `if`, and a row with
  // nothing to offer simply never opens the menu.
  const press = useLongPress(at => { if (rel) setMenuAt(at) })

  // No node means there is no entity to describe (free float, a missing owner),
  // so no marker rather than a meaningless grey one.
  const body = <>{node ? <TypeMarker node={node} /> : null}{children}</>
  const row = (node && node.id && onNavigate)
    ? <button type="button" className="rel-item rel-item--clickable" onClick={() => onNavigate(node)}>{body}</button>
    : <div className="rel-item">{body}</div>
  if (!rel) return row

  const items = [
    { key: 'report', label: t('menu.reportRelationship'), icon: <FiFlag size={12} />,
      onSelect: () => setReporting(true) },
    // Omitted rather than disabled when the relationship has no record to open:
    // a dead menu item invites a click that does nothing.
    ...(rel.sourceUrl ? [{
      key: 'source', label: t('menu.viewSource'), icon: <FiExternalLink size={12} />,
      onSelect: () => window.open(rel.sourceUrl as string, '_blank', 'noopener,noreferrer'),
    }] : []),
  ]

  return (
    <div className="rel-row" {...press}>
      {row}
      <ActionMenu items={items} position={menuAt} onClose={() => setMenuAt(null)} />
      {reporting && (
        <ReportModal targetKind={rel.targetKind} targetLabel={rel.label}
                     fromId={rel.fromId} toId={rel.toId} role={rel.role}
                     onClose={() => setReporting(false)} />
      )}
    </div>
  )
}

interface EntityOverviewProps {
  profile: FullProfile
  sources: Source[]
  onExportPng?: () => void
  onExportCsv?: () => void
  onViewOnMap?: () => void
  onShare?: () => void
  onNavigate?: (node: NodeData) => void
  node: NodeData
  onReScrape?: (node: NodeData) => void
}

function credibilityColor(score: number): string {
  if (score >= 70) return '#2ECC71'
  if (score >= 40) return '#F39C12'
  return '#E74C3C'
}

// Collapsible provenance list — the sources behind a node's facts. Shared by the
// entity and person panels.
function SourcesSection({ sources }: { sources: Source[] }) {
  const { t } = useTranslation()
  if (!sources.length) return null
  return (
    <CollapsibleSection title={t('panel.sources')} count={sources.length}>
      {sources.map((s, i) => {
        const reported    = formatProvenanceDate(s.source_date)
        const lastChecked = formatProvenanceDate(s.last_scraped_at)
        return (
          <div key={`${s.id}-${s.url ?? ''}-${i}`} className="source-item">
            <div className="source-item__header">
              {s.url
                ? <a className="source-item__name" href={s.url} target="_blank" rel="noreferrer">
                    <FiExternalLink size={11} /> {s.name}
                  </a>
                : <span className="source-item__name">{s.name}</span>
              }
              <span className="source-type-badge">{s.type}</span>
            </div>
            <div className="credibility-bar" title={`${t('panel.credibility')}: ${s.credibility_score}/100`}>
              <div
                className="credibility-bar__fill"
                style={{ width: `${s.credibility_score}%`, background: credibilityColor(s.credibility_score) }}
              />
            </div>
            <span className="credibility-score" style={{ color: credibilityColor(s.credibility_score) }}>
              {s.credibility_score}/100
            </span>
            {(reported || lastChecked) && (
              <div className="source-item__prov">
                {reported    && <span>{t('panel.reported',    { date: reported })}</span>}
                {lastChecked && <span>{t('panel.lastChecked', { date: lastChecked })}</span>}
              </div>
            )}
          </div>
        )
      })}
    </CollapsibleSection>
  )
}

// Only surface source statements for entities collapsed from several filings — a
// single opaque statement id per node is noise. For a collapsed party (e.g. a
// government re-declared per controlled company) every declaring PSC statement is
// shown, so per-statement provenance stays visible after the merge.
export function showSourceStatements(ids?: string[]): boolean {
  return (ids?.length ?? 0) >= 2
}

function SourceStatements({ ids }: { ids?: string[] }) {
  const { t } = useTranslation()
  if (!ids || !showSourceStatements(ids)) return null
  return (
    <CollapsibleSection title={t('panel.sourceStatements')} count={ids.length}>
      <ul className="source-statements">
        {ids.map(id => <li key={id} className="source-statements__id">{id}</li>)}
      </ul>
    </CollapsibleSection>
  )
}

function EntityOverview({ profile, sources, onExportPng, onExportCsv, onViewOnMap, onShare, onNavigate, node, onReScrape }: EntityOverviewProps) {
  const { t, i18n } = useTranslation()
  const { entity, counts, owners = [], subsidiaries = [], executives = [], dual_listed = [],
          succeeded_by = [], replaces = [], ownership, cross_holdings = [] } = profile
  const imgSrc = useWikidataImage(entity.wikidata_id)

  // Surface founders in their own section rather than buried among executives.
  const seenFounders = new Set<string>()
  const founders = executives.filter(e => {
    if (e.role?.role !== 'Founder' || seenFounders.has(e.person.id)) return false
    seenFounders.add(e.person.id)
    return true
  })
  const otherExecutives = executives.filter(e => e.role?.role !== 'Founder')

  const fmt = (n: number) =>
    n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${n}`

  // Employee count: grouped digits, with the as-of year when known
  // (e.g. "228,000 (2024)").
  const employeeText = entity.employees != null
    ? entity.employees.toLocaleString(i18n.language) +
      (entity.employees_as_of ? ` (${entity.employees_as_of})` : '')
    : null

  // HQ location comes from the entity itself. It used to prefer a linked
  // Location node and fall back to these; the node is gone, so the fallback is
  // now the only path — one place the address lives, one place to keep right.
  const hqCity    = entity.hq_city
  const hqCountry = entity.hq_country
  const hqText    = [hqCity, hqCountry && countryName(hqCountry, i18n.language)].filter(Boolean).join(', ')

  // Dual-listed companies have multiple domiciles / HQs.
  const countryList = (entity.countries?.length ? entity.countries : (entity.country ? [entity.country] : []))
    .map(c => countryName(c, i18n.language))

  // Where a company chose to be domiciled at a finer grain than the country —
  // Delaware, Ontario, Nevis. Shown only when there is more to say than the
  // country row already says, so a UK company does not get a redundant line.
  const subdivision = entity.jurisdiction_code && isSubdivision(entity.jurisdiction_code)
    ? subdivisionName(entity.jurisdiction_code)
    : null
  const hqList = (entity.hq_locations?.length
    ? entity.hq_locations.map(loc => {
        const [city, cc] = loc.split('|')
        return [city, cc && countryName(cc, i18n.language)].filter(Boolean).join(', ')
      })
    : (hqText ? [hqText] : []))

  // The full HQ address the map pin is geocoded from — previously assembled
  // from the Location node's street/city/state/zip/country.
  const address   = entity.hq_address || ''
  const hasCoords = entity.hq_lat != null && entity.hq_lng != null

  return (
    <div className="panel-body">
      {imgSrc && (
        <img className="panel-logo" src={imgSrc} alt={entity.name} />
      )}
      <span className={`node-type-badge node-type-badge--${entity.type || 'company'}`}>
        {t(`legend.${entity.type || 'company'}`, { defaultValue: entity.type || 'company' })}
      </span>
      {entity.is_nominee && (
        <span className="nominee-badge" title={t('panel.nomineeHint')}>{t('panel.nominee')}</span>
      )}
      <div className="panel-header-row">
        <h2 className="panel-name">{entity.name}</h2>
        <NodeActions label={entity.name} nodeId={entity.id} targetKind="entity" onShare={onShare} />
      </div>
      <NodeFlags nodeId={entity.id} targetKind="entity" label={entity.name} />
      {entity.description && <p className="panel-desc">{entity.description}</p>}

      <div className="panel-meta">
        <MetaRow icon={FiMapPin}     label={countryList.length > 1 ? t('panel.countries') : t('panel.country')} value={countryList.join(', ') || null} />
        {subdivision && (
          <MetaRow icon={FiMapPin} label={t('panel.registeredIn')} value={subdivision} />
        )}
        <MetaRow icon={FiCalendar}   label={t('panel.founded')}  value={entity.founded} />
        <MetaRow icon={FiDollarSign} label={t('panel.revenue')}  value={entity.revenue != null ? fmt(entity.revenue) : null} />
        <MetaRow icon={FiUsers}      label={t('panel.employees')} value={employeeText} />
        {hqList.length > 0 && <MetaRow icon={FiMapPin} label={hqList.length > 1 ? t('panel.headquarters') : t('panel.hq')} value={hqList.join(' · ')} />}
        {address && address !== hqText && (
          <MetaRow icon={FiMapPin} label={t('panel.address')} value={address} />
        )}
        {hasCoords && (
          <div className="meta-row">
            <FiMapPin className="meta-icon" />
            <span className="meta-label">{t('panel.coordinates')}</span>
            <span className="meta-value">
              {entity.hq_lat!.toFixed(4)}, {entity.hq_lng!.toFixed(4)}
              {onViewOnMap && (
                <button type="button" className="panel-map-link" onClick={onViewOnMap}>
                  {t('panel.viewOnMap')}
                </button>
              )}
            </span>
          </div>
        )}
      </div>

      {owners.length > 0 && (
        <Section title={t('panel.ownedBy')}>
          {[...owners].sort(byStakeDesc(
            o => o.relationship?.stake_percent,
            o => o.owner ? ('name' in o.owner ? o.owner.name : o.owner.full_name) : '',
          )).map((o, i) => (
            <RelRow key={i} node={o.owner ? ownerToNode(o.owner) : null} onNavigate={onNavigate}
              rel={o.owner
                ? { targetKind: 'owns', fromId: o.owner.id, toId: entity.id,
                    label: ('name' in o.owner ? o.owner.name : o.owner.full_name),
                    sourceUrl: o.relationship?.source_url }
                : undefined}>
              <span className="rel-item__name">
                {o.owner ? ('name' in o.owner ? o.owner.name : o.owner.full_name) : '—'}
                {o.owner && 'name' in o.owner && o.owner.is_nominee && (
                  <span className="nominee-badge" title={t('panel.nomineeHint')}>{t('panel.nominee')}</span>
                )}
              </span>
              <OwnershipBadge
                type={o.relationship?.ownership_type}
                percent={o.relationship?.stake_percent}
                votingPct={o.relationship?.voting_power_pct}
              />
            </RelRow>
          ))}
          {ownership?.free_float_pct != null && (
            <div className="rel-item">
              <span className="rel-item__name rel-item__name--muted">{t('panel.freeFloat')}</span>
              <span className="ownership-badge ownership-badge--computed">{ownership.free_float_pct}%</span>
            </div>
          )}
          {ownership?.exceeds_100 && (
            <div className="ownership-warning">
              ⚠ {t('panel.ownershipExceeds', { pct: ownership.disclosed_pct })}
            </div>
          )}
        </Section>
      )}

      {cross_holdings.length > 0 && (
        <Section title={t('panel.crossHoldings')}>
          <div className="ownership-warning">↻ {t('panel.crossHoldingsHint')}</div>
          {[...cross_holdings].sort(byName(c => c.name ?? '')).map((c, i) => (
            <RelRow key={i} node={entityToNode(c)} onNavigate={onNavigate}>
              <span className="rel-item__name">{c.name}</span>
            </RelRow>
          ))}
        </Section>
      )}

      {dual_listed.length > 0 && (
        <Section title={t('panel.dualListedWith')}>
          {[...dual_listed].sort(byName(d => d.name ?? '')).map((d, i) => (
            <RelRow key={i} node={entityToNode(d)} onNavigate={onNavigate}>
              <span className="rel-item__name">{d.name}</span>
            </RelRow>
          ))}
        </Section>
      )}

      {succeeded_by.length > 0 && (
        <Section title={t('panel.succeededBy')}>
          {[...succeeded_by].sort(byName(s => s.name ?? '')).map((s, i) => (
            <RelRow key={i} node={entityToNode(s)} onNavigate={onNavigate}>
              <span className="rel-item__name">{s.name}</span>
              {s.since && <span className="rel-item__year">{s.since.slice(0, 4)}</span>}
            </RelRow>
          ))}
        </Section>
      )}

      {replaces.length > 0 && (
        <Section title={t('panel.replaces')}>
          {[...replaces].sort(byName(p => p.name ?? '')).map((p, i) => (
            <RelRow key={i} node={entityToNode(p)} onNavigate={onNavigate}>
              <span className="rel-item__name">{p.name}</span>
              {p.since && <span className="rel-item__year">{p.since.slice(0, 4)}</span>}
            </RelRow>
          ))}
        </Section>
      )}

      {founders.length > 0 && (
        <Section title={t('panel.foundedBy')}>
          {[...founders].sort(byName(f => f.person?.full_name ?? '')).map((f, i) => (
            <RelRow key={i} node={personToNode(f.person)} onNavigate={onNavigate}
              rel={{ targetKind: 'role', fromId: f.person.id, toId: entity.id,
                     role: f.role?.role || 'Founder', label: f.person.full_name,
                     sourceUrl: f.role?.source_url }}>
              <span className="rel-item__name">{f.person.full_name}</span>
            </RelRow>
          ))}
        </Section>
      )}

      {subsidiaries.length > 0 && (
        <Section title={t('panel.subsidiaries')} count={counts?.subsidiaries}>
          {(() => {
            const sorted = [...subsidiaries].sort(
              byStakeDesc(s => s.relationship?.stake_percent, s => s.entity?.name ?? ''))
            const row = (s: SubsidiaryEntry, i: number) => (
              <RelRow key={i} node={entityToNode(s.entity)} onNavigate={onNavigate}
                rel={{ targetKind: 'owns', fromId: entity.id, toId: s.entity.id,
                       label: s.entity.name, sourceUrl: s.relationship?.source_url }}>
                <span className="rel-item__name">{s.entity.name}</span>
                <OwnershipBadge type={s.relationship?.ownership_type} percent={s.relationship?.stake_percent} />
              </RelRow>
            )

            // Only the indirect holdings are set apart. A subsidiary listed under a
            // company is a holding of that company — that needs no heading to say so,
            // and labelling the ordinary case made the panel look like it was drawing
            // a distinction where there is none. "Held indirectly" is the one that
            // genuinely means something else: the company sits further down the tree.
            //
            // Relationships whose source never states the distinction (Wikidata, SEC)
            // stay in the main list rather than getting a group of their own. That
            // does not claim they are direct — the list makes no claim either way —
            // where a "Direct holdings" heading above them would have.
            const indirect = sorted.filter(s => s.relationship?.direct_or_indirect === 'indirect')
            const rest = sorted.filter(s => s.relationship?.direct_or_indirect !== 'indirect')

            // Splitting earns its keep only on a long list that actually splits: with
            // nothing left in the main list, the heading would just retitle the section.
            const worthGrouping =
              sorted.length > GROUPING_THRESHOLD && indirect.length > 0 && rest.length > 0
            if (!worthGrouping) return sorted.map(row)

            return (
              <>
                {rest.map(row)}
                <CollapsibleSection title={t('panel.indirectHoldings')} count={indirect.length}>
                  {indirect.map(row)}
                </CollapsibleSection>
              </>
            )
          })()}
        </Section>
      )}

      {otherExecutives.length > 0 && (
        <Section title={t('panel.executives')} count={counts?.executives}>
          {[...otherExecutives].sort(byRoleImportance(e => e.role?.role, e => e.person?.full_name ?? '')).map((e, i) => (
            <RelRow key={i} node={personToNode(e.person)} onNavigate={onNavigate}
              rel={{ targetKind: 'role', fromId: e.person.id, toId: entity.id,
                     role: e.role?.role, label: e.person.full_name,
                     sourceUrl: e.role?.source_url }}>
              <span className="rel-item__name">{e.person.full_name}</span>
              <span className="role-badge">{e.role?.role}</span>
            </RelRow>
          ))}
        </Section>
      )}

      <DetailsSection entity={entity} />
      {onReScrape && (
        <div className="panel-rescrape">
          <button type="button" className="panel-rescrape__btn"
                  title={t('panel.reScrapeTitle')} onClick={() => onReScrape(node)}>
            {t('panel.reScrape')}
          </button>
        </div>
      )}
      <SourcesSection sources={sources} />
      <SourceStatements ids={entity.source_statement_ids} />

      {(onExportPng || onExportCsv) && (
        <div className="panel-export">
          {onExportPng && (
            <button className="panel-export__btn" onClick={onExportPng}>
              <FiDownload /> {t('graph.exportPng')}
            </button>
          )}
          {onExportCsv && (
            <button className="panel-export__btn" onClick={onExportCsv}>
              <FiDownload /> {t('graph.exportCsv')}
            </button>
          )}
        </div>
      )}

    </div>
  )
}

function PanelTabs({ active, onChange }: { active: string; onChange: (tab: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="panel-tabs">
      <button
        className={`panel-tab ${active === 'overview' ? 'panel-tab--active' : ''}`}
        onClick={() => onChange('overview')}
      >
        <FiList /> {t('panel.overview')}
      </button>
      <button
        className={`panel-tab ${active === 'timeline' ? 'panel-tab--active' : ''}`}
        onClick={() => onChange('timeline')}
      >
        <FiClock /> {t('panel.timeline')}
      </button>
    </div>
  )
}

export default function NodePanel({ node, onExportPng, onExportCsv, onViewOnMap, onShare, onNavigate, onReScrape, refreshKey }: NodePanelProps) {
  const { t } = useTranslation()
  const [profile,    setProfile]    = useState<FullProfile | null>(null)
  const [sources,    setSources]    = useState<Source[]>([])
  const [loading,    setLoading]    = useState<boolean>(false)
  const [activeView, setActiveView] = useState<string>('overview')
  const prevIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!node || node.nodeType !== 'entity') {
      prevIdRef.current = null
      setProfile(null)
      setSources([])
      return
    }
    // Selecting a different node clears + shows the spinner; a refreshKey bump for the SAME
    // node is a silent in-place refetch (keeps the current data visible, no spinner flash).
    const idChanged = prevIdRef.current !== node.id
    prevIdRef.current = node.id
    if (idChanged) {
      setActiveView('overview')
      setLoading(true)
      setProfile(null)
      setSources([])
    }
    let active = true
    Promise.all([
      getFullProfile(node.id),
      getEntitySources(node.id).catch(() => ({ data: [] as Source[] })),
    ])
      .then(([{ data: prof }, { data: srcs }]) => {
        if (!active) return
        setProfile(prof)
        setSources(srcs)
      })
      .catch(() => { if (active && idChanged) setProfile(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [node?.id, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) {
    return (
      <div className="panel-empty">
        <div className="panel-empty-icon">◈</div>
        <p>{t('panel.empty').split('\n').map((line, i) => <span key={i}>{line}{i === 0 && <br />}</span>)}</p>
      </div>
    )
  }

  if (node.nodeType === 'person') {
    return <PersonView node={node} onNavigate={onNavigate} onShare={onShare}
                       onReScrape={onReScrape} />
  }

  if (loading) {
    return (
      <div className="panel-empty">
        <span className="panel-spinner" />
      </div>
    )
  }

  if (!profile) return null

  return (
    <>
      <PanelTabs active={activeView} onChange={setActiveView} />
      {activeView === 'overview'
        ? <EntityOverview profile={profile} sources={sources} node={node} onReScrape={onReScrape} onExportPng={onExportPng} onExportCsv={onExportCsv} onViewOnMap={onViewOnMap} onShare={onShare} onNavigate={onNavigate} />
        : <TimelinePanel entityId={profile.entity.id} />}
    </>
  )
}
