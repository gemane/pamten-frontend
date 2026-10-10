import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FiMoreVertical, FiShare2, FiMapPin, FiCalendar, FiDollarSign, FiUsers, FiExternalLink, FiList, FiClock, FiDownload, FiShield, FiChevronRight, FiChevronDown, FiFlag, FiTag, FiBriefcase, FiHash, FiGlobe, FiSearch } from 'react-icons/fi'
import { getFullProfile, getEntitySources, getPersonProfile, getPersonSources, getSubsidiaryTree } from '../services/api'
import { countryName } from '../utils/isoCountries'
import { ageFrom } from '../utils/age'
import { isSubdivision, subdivisionName } from '../utils/isoSubdivisions'
import { colorFor, typeLabelKey } from '../utils/entityColors'
import CorroborationBadge from './CorroborationBadge'
import ReadingBadge, { readingGrade } from './ReadingBadge'
import OwnershipBadge from './OwnershipBadge'
import TimelinePanel  from './TimelinePanel'
import NodeFlags      from './NodeFlags'
import PersonTimeline, { hasDatedRows } from './PersonTimeline'
import ActionMenu     from './ActionMenu'
import ReportModal    from './ReportModal'
import { useLongPress } from '../hooks/useLongPress'
import { FOCUS_ATTR, scrollingPanel, useGraphFocusHighlight, useGraphHoverHighlight } from '../utils/graphFocus'
import { byStakeDesc } from '../utils/ordering'
import { displayName, entityLabel } from '../utils/displayName'
import { namesakeCountries } from '../utils/namesakes'
import { useGraphFocus, type GraphFocusMode } from '../hooks/useGraphFocus'
import type { NodeData, FullProfile, PersonProfile, Person, Entity, Source, SubsidiaryEntry, OwnsRelationship, RoleRelationship, SubsidiaryTree, ReadFrom } from '../types'
import { keepsEdge, effectiveStakePct, ANY_STAKE, type StakeFilter } from './GraphStakeFilter'
import { asOfYear, edgePresence, endedBy, rowPresence, startedAfter, type Tenure } from '../utils/asOf'

// Ordering helpers for the related-node lists (owners, subsidiaries, …), which
// otherwise render in arbitrary backend order.
// - byStakeDesc (utils/ordering, shared with the graph's tree): largest ownership stake first (the most meaningful order for an
//   ownership map); rows with no known stake sort last, ties alphabetical.
// - byName: plain A→Z, for people/relationships without a stake.
function byName<T>(getName: (x: T) => string) {
  return (a: T, b: T) => getName(a).localeCompare(getName(b))
}

/** A finished role's years, e.g. "1977 – 1985". Years only, matching the
 *  timeline and the panel's own rule on dates about people: an age rather than
 *  a birthday, a year rather than a day. Where the start was never recorded —
 *  common in reverse lookups — the end alone is stated rather than invented. */
export function tenure(role: { since?: string | null; until?: string | null } | null | undefined,
                       t: (k: string, o?: Record<string, unknown>) => string): string {
  const from = role?.since?.slice(0, 4)
  const to = role?.until?.slice(0, 4)
  if (!to) return ''
  return from ? `${from} \u2013 ${to}` : t('timeline.until', { year: to })
}

/** Most recent first: a career reads backwards from what someone last did.
 *  Undated starts sort last, as they do everywhere else. */
export function byTenureDesc<T extends { role?: { since?: string | null; until?: string | null } | null }>(
  a: T, b: T,
): number {
  const ka = a.role?.until || a.role?.since || ''
  const kb = b.role?.until || b.role?.since || ''
  if (!ka && !kb) return 0
  if (!ka) return 1
  if (!kb) return -1
  return kb.localeCompare(ka)
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
  return { id: e.id, label: entityLabel(e), nodeType: 'entity', entitySubtype: e.type, raw: e }
}
/** A company's name in a row: the one the viewer reads (utils/displayName),
 *  the other on hover. */
/** ``place``: the country that tells this company apart from a namesake in
 *  the same list (``namesakeCountries``) — shown only then. */
function CompanyName({ e, place }: { e: Entity; place?: string }) {
  const d = displayName(e)
  return (
    <span className="rel-item__name" title={d.secondary ?? undefined}>
      {d.primary}{place && <span className="rel-item__place"> ({place})</span>}
    </span>
  )
}
const ownerName = (o: Entity | Person) => 'name' in o ? entityLabel(o) : o.full_name

export function personToNode(p: Person): NodeData {
  return { id: p.id, label: p.full_name, nodeType: 'person', raw: p }
}
export function ownerToNode(owner: Entity | Person): NodeData {
  return 'name' in owner ? entityToNode(owner) : personToNode(owner)
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
  /** The company's spreadsheet, built server-side; given the entity's id. */
  onExportSpreadsheet?: (entityId: string) => void
  onViewOnMap?: () => void
  onShare?: () => void
  onNavigate?: (node: NodeData) => void
  // Force a fresh scrape of this company (verified users only — App passes undefined otherwise).
  onReScrape?: (node: NodeData) => void
  // The node whose "Refresh from sources" is in flight — its button shows the
  // running state instead of inviting a second click.
  refreshingId?: string | null
  // Bumped by App when an on-demand scrape appends data → refetch this node's profile in
  // place (the effect is keyed on node.id, which doesn't change when the same node is enriched).
  refreshKey?: number
  // Shared with the graph's stake filter, so one control hides small holdings
  // in both views. Defaults to "any" when a caller does not pass it.
  stakeFilter?: StakeFilter
  /** "All levels": the subsidiary list shows the whole tree, indented by level. */
  allLevels?: boolean
  /** Time travel: the day the graph shows; the profile is fetched as of it and
   *  the lists hide what was absent and dim what is undocumented for it. */
  asOf?: string | null
  /** A year clicked in the timeline (null = back to the present). */
  onYearSelect?: (asOf: string | null) => void
  /**
   * Called with the graph id of the owner/subsidiary row in focus (the hovered
   * row on desktop, the row at the panel's centre while scrolling on a phone),
   * and with null when none is. App hands it to the graph, which grows the node.
   */
  onGraphFocus?: (id: string | null) => void
  graphFocusMode?: GraphFocusMode
  /**
   * The other direction: the graph node under the mouse (desktop). Its owner or
   * subsidiary row lights up, so the list shows which line a box stands for.
   */
  graphHoverId?: string | null
  /** The graph node in focus (the row under the mouse, or at the phone's
   *  centre) — its row is shown a shade darker, as the graph shows its box. */
  graphFocusId?: string | null
}



interface MetaRowProps {
  icon: React.ElementType
  label: string
  value?: string | number | null
  href?: string
}

function MetaRow({ icon: Icon, label, value, href }: MetaRowProps) {
  if (!value) return null
  return (
    <div className="meta-row">
      <Icon className="meta-icon" />
      <span className="meta-label">{label}</span>
      {href
        ? <a className="meta-value meta-value--link" href={href}
             target="_blank" rel="noreferrer">
            {value} <FiExternalLink size={11} />
          </a>
        : <span className="meta-value">{value}</span>}
    </div>
  )
}

function Section({ title, count, shown, children }: {
  title: string
  /** True total from the server. Not the child count: sections are capped, so what
   *  is rendered can be fewer than what exists. */
  count?: number | null
  /** How many rows the server actually sent. When fewer than `count`, the list was
   *  cut by the profile's section cap and the panel says so — News Corp showed 200
   *  of 300 subsidiaries with nothing to tell a reader the rest existed. */
  shown?: number
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  const cut = count != null && shown != null && shown < count
  return (
    <div className="panel-section">
      <h4 className="panel-section__title">
        {title}{count != null && <span className="panel-section__count">{count}</span>}
      </h4>
      {children}
      {cut && (
        <div className="panel-section__cut" role="note">
          {t('panel.capped', { shown, total: count })}
        </div>
      )}
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
export interface DetailRow {
  icon: React.ElementType
  labelKey: string
  value: string
  /** When present, the value renders as an external link. Always pass a
   *  safeHref()-gated URL — the property is scraped data and gets no scheme
   *  trust, however plausible it looks. */
  href?: string
}
export function entityDetailRows(entity: Entity): DetailRow[] {
  const registeredAt = [entity.registration_authority, entity.registration_number]
    .filter(Boolean).join(' · ')
  const candidates: { icon: React.ElementType; labelKey: string; value?: string | null;
                      href?: string }[] = [
    { icon: FiBriefcase, labelKey: 'panel.legalForm',    value: entity.legal_form },
    { icon: FiHash,      labelKey: 'panel.registeredAt', value: registeredAt || null },
    { icon: FiCalendar,  labelKey: 'panel.founded',      value: entity.founded_date },
    { icon: FiMapPin,    labelKey: 'panel.regAddress',   value: entity.address },
  ]
  return candidates.filter((r): r is DetailRow => !!r.value)
}

/**
 * Why a company reports no parent — GLEIF's *reporting exceptions*.
 *
 * An LEI holder must name its parent company or file a reason why not; silence is
 * not an allowed answer. So "no parent" splits into two very different facts, and
 * this is the second: asked, and declined, in public, with a reason attached.
 *
 * The trap this is written around: GLEIF asks who **consolidates the accounts**,
 * not who holds the shares. 53 of the 63 companies carrying a reason on the dev
 * graph also have owners — Apple lists 37 from SEC filings *and* reports
 * NATURAL_PERSONS. So this cannot be shown as "no owners", and it cannot be
 * gated on the owners list being empty, which would hide it in 84% of cases.
 *
 * Pure and i18n-free like `entityDetailRows`, so the awkward parts — collapsing a
 * duplicated pair, a multi-reason field, an unsafe reference — are unit tested
 * without rendering anything.
 */
export interface ParentExceptionReason {
  /** GLEIF's wire token, upper-cased: the `parentReason.*` translation key. */
  key: string
  /** The token humanised, for a code GLEIF adds that we have no copy for yet. */
  fallback: string
}
export interface ParentExceptionLine {
  scope: 'direct' | 'ultimate' | 'both'
  reasons: ParentExceptionReason[]
  /** The filer's pointer at the parent it would not name, exactly as published. */
  reference: string | null
  /** Set only when `reference` is a safe http(s) URL — see `_safeHref`. */
  href: string | null
}

/** Reasons from one comma-joined field: trimmed, uppercased, de-duplicated, in order. */
function parseReasons(raw?: string | null): ParentExceptionReason[] {
  const seen = new Set<string>()
  const out: ParentExceptionReason[] = []
  for (const part of (raw ?? '').split(',')) {
    const key = part.trim().toUpperCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ key, fallback: key.toLowerCase().replace(/_/g, ' ') })
  }
  return out
}

/** A reference we are willing to turn into a link.
 *
 *  http(s) only, and no scheme-guessing: prepending `https://` to a register's
 *  free text would fabricate a destination we were never given. Anything else —
 *  `javascript:`, a bare `www.…`, a sentence naming a filing — is still shown,
 *  as text. */
function safeHref(reference: string | null): string | null {
  if (!reference) return null
  try {
    const url = new URL(reference)
    return url.protocol === 'http:' || url.protocol === 'https:' ? reference : null
  } catch {
    return null
  }
}

/** A search we offer, not a fact we assert. Constant prefix + encoded query,
 *  so it cannot be a `javascript:` URI and needs no safeHref gate; persons get
 *  the name quoted so Google treats it as a phrase, not four loose words. */
export function googleSearchHref(name?: string | null, opts?: { quote?: boolean }): string | null {
  const n = name?.trim()
  if (!n) return null
  return 'https://www.google.com/search?q=' + encodeURIComponent(opts?.quote ? `"${n}"` : n)
}

/** The panel's one web row: the entity's own site when a source stated one
 *  (host as text, full URL as the link), otherwise a Google search for the
 *  name. An unusable stored URL counts as absent — the search link is more
 *  honest than a dead row. */
export function webLinkRow(entity: Entity): DetailRow | null {
  const websiteHref = safeHref(entity.website ?? null)
  if (websiteHref) {
    return { icon: FiGlobe, labelKey: 'panel.website',
             value: linkHost(entity.website) ?? websiteHref, href: websiteHref }
  }
  const search = googleSearchHref(entity.name)
  return search ? { icon: FiSearch, labelKey: 'panel.webSearch',
                    value: 'Google', href: search } : null
}

const trimmed = (v?: string | null): string | null => v?.trim() || null

export function parentExceptionLines(entity: Entity): ParentExceptionLine[] {
  const line = (scope: 'direct' | 'ultimate' | 'both',
                reasons: ParentExceptionReason[], reference: string | null): ParentExceptionLine =>
    ({ scope, reasons, reference, href: safeHref(reference) })

  const direct = parseReasons(entity.no_direct_parent_reason)
  const ultimate = parseReasons(entity.no_ultimate_parent_reason)
  const directRef = trimmed(entity.no_direct_parent_reason_reference)
  const ultimateRef = trimmed(entity.no_ultimate_parent_reason_reference)

  if (!direct.length && !ultimate.length) return []
  if (!ultimate.length) return [line('direct', direct, directRef)]
  if (!direct.length) return [line('ultimate', ultimate, ultimateRef)]

  // Most filers answer both questions the same way (14 of the 14 that answer both,
  // on the dev graph), and saying it twice reads as a bug. Collapse only on a true
  // match: the reason *sets* — order is not meaning — and the references, because
  // two different pointers are two different statements however alike the reasons.
  const same = (a: ParentExceptionReason[], b: ParentExceptionReason[]) =>
    a.length === b.length &&
    a.map(r => r.key).sort().join(',') === b.map(r => r.key).sort().join(',')
  if (same(direct, ultimate) && directRef === ultimateRef) {
    return [line('both', direct, directRef)]
  }
  return [line('direct', direct, directRef), line('ultimate', ultimate, ultimateRef)]
}

/**
 * The block itself, rendered inside "Details" beside the other GLEIF-derived
 * facts — legal form, registration, address.
 *
 * It keeps a heading of its own even there, because Details is otherwise a
 * label/value table and this is prose: the heading marks where the format
 * changes and names what the sentence is about. And it is deliberately *not* a
 * `MetaRow` — a reason runs to a line and a half and would be squeezed into the
 * value column, beside a 70px label, with a reference link after it.
 *
 * `hasOwners` only chooses which hint to show.
 */
function ParentExceptionSection({ entity, hasOwners }: { entity: Entity; hasOwners: boolean }) {
  const { t } = useTranslation()
  const lines = parentExceptionLines(entity)
  if (!lines.length) return null

  const SENTENCE = { direct: 'panel.parentNoneDirect', ultimate: 'panel.parentNoneUltimate',
                     both: 'panel.parentNoneBoth' } as const

  return (
    <Section title={t('panel.parentCompany')}>
      {lines.map((line, i) => (
        <p className="panel-desc" key={i}>
          {t(SENTENCE[line.scope], {
            reasons: line.reasons
              .map(r => t(`parentReason.${r.key}`, { defaultValue: r.fallback }))
              .join('; '),
          })}
          {line.href
            ? <> <a className="panel-link" href={line.href} target="_blank" rel="noreferrer"
                   title={line.reference ?? undefined}>{t('panel.parentReference')}</a></>
            : line.reference && <span className="rel-item__name--muted"> {line.reference}</span>}
        </p>
      ))}
      <p className="panel-desc">
        {hasOwners ? t('panel.parentNoneHintOwners') : t('panel.parentNoneHint')}
      </p>
    </Section>
  )
}

// Collapsible "Details" — a small container for factual fields (legal form, where the
// entity is registered, its registered address) that aren't part of the primary meta
// or the relationship sections. Hidden entirely when the entity has none of them.
function DetailsSection({ entity, hasOwners }: { entity: Entity; hasOwners: boolean }) {
  const { t } = useTranslation()
  const rows = entityDetailRows(entity)
  // The parent statement counts towards "does this section have anything to say".
  // `entityDetailRows` only knows about legal form, registration, founding date and
  // address, so a company that filed a reason and has none of those would otherwise
  // render no Details section — and lose the statement with it.
  const hasParentStatement = parentExceptionLines(entity).length > 0
  if (!rows.length && !hasParentStatement) return null
  return (
    <CollapsibleSection title={t('panel.details')}>
      {rows.length > 0 && (
        <div className="panel-meta">
          {rows.map((r, i) => <MetaRow key={i} icon={r.icon} label={t(r.labelKey)} value={r.value} href={r.href} />)}
        </div>
      )}
      {/* A sibling of `.panel-meta`, not a row inside it: that is what gives it the
          full panel width instead of the value column. */}
      <ParentExceptionSection entity={entity} hasOwners={hasOwners} />
    </CollapsibleSection>
  )
}

/** "Refresh from sources", shared by the person and the company panel. While
 *  the refresh runs — minutes, once the SEC enrichments start — the button
 *  says so and refuses a second click; the summary toast announces the end. */
function ReScrapeButton({ node, onReScrape, refreshing }: {
  node: NodeData
  onReScrape: (node: NodeData) => void
  refreshing: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="panel-rescrape">
      <button type="button" className="panel-rescrape__btn"
              title={t('panel.reScrapeTitle')} disabled={refreshing} aria-busy={refreshing}
              onClick={() => onReScrape(node)}>
        {refreshing ? t('panel.refreshing') : t('panel.reScrape')}
      </button>
    </div>
  )
}

function PersonView({ node, onNavigate, onShare, onReScrape, refreshingId, stakeFilter = ANY_STAKE, asOf = null }: {
  node: NodeData
  onNavigate?: (n: NodeData) => void
  onShare?: () => void
  onReScrape?: (node: NodeData) => void
  refreshingId?: string | null
  stakeFilter?: StakeFilter
  asOf?: string | null
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
  // The profile carries a person's whole history now, ended roles included, so
  // the timeline can draw a career. The overview splits it: what they do *now*,
  // then what they used to do, each ended role carrying its years.
  //
  // The split is what makes the history readable at all. Steve Jobs sat on
  // Apple's board twice; listed together and undated, those two rows look like
  // the duplicate bug we just fixed. Dated and set apart, they read as a career.
  // Filtering happens here rather than on the server so the timeline — and any
  // other caller — still gets everything.
  // Which source asserted each relationship, for the row menu's header. Built
  // once per render rather than per row: the list is short but the lookup is not
  // free, and every position and holding wants it.
  const sourceName = sourceNames(sources)
  const allPositions = profile?.positions ?? []
  const allHoldings  = profile?.holdings  ?? []
  // Current = not ended (by the chosen day, in the as-of view) and not started
  // after it; "former" is a present-tense notion and has no place in a past view.
  const positions = allPositions.filter(p => !endedBy(p.role, asOf) && !startedAfter(p.role, asOf))
  const formerPositions = asOf ? [] : allPositions.filter(p => p.role?.until)
  const holdings  = allHoldings.filter(h => !endedBy(h.relationship, asOf) && !startedAfter(h.relationship, asOf))
    .filter(h => keepsEdge(effectiveStakePct(h.relationship?.stake_percent, h.relationship?.shares, h.relationship?.shares_outstanding), stakeFilter))

  // The blocs this person votes in. Three of AB InBev's nine parties are
  // people, and their pages showed no sign of the agreement.
  const votingGroups = profile?.voting_groups ?? []
  const [activeView, setActiveView] = useState<string>('overview')
  // Only offer the timeline when something is dated. Roughly half the people in
  // the graph have no dated position at all — their roles come from a reverse
  // lookup that carries none — and an empty tab on every one of them is worse
  // than no tab.
  const showTimeline = hasDatedRows(profile)

  // Tabs OUTSIDE the padded body, exactly as the company panel nests them: the
  // bar then spans the full width and the body's own padding is the gap beneath
  // it. Inside, it was inset by that padding and sat flush against the avatar.
  if (showTimeline && activeView === 'timeline' && profile) {
    return (
      <>
        <PanelTabs active={activeView} onChange={setActiveView} />
        <div className="panel-body">
          <PersonTimeline profile={profile} />
        </div>
      </>
    )
  }

  return (
    <>
      {showTimeline && <PanelTabs active={activeView} onChange={setActiveView} />}
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
        <MetaRow icon={FiSearch} label={t('panel.webSearch')}
                 value={googleSearchHref(raw.full_name, { quote: true }) ? 'Google' : null}
                 href={googleSearchHref(raw.full_name, { quote: true }) ?? undefined} />
      </div>

      {votingGroups.length > 0 && (
        <Section title={t('panel.votesIn')}>
          {votingGroups.map((g, i) => (
            <RelRow key={i} node={entityToNode(g.group)} onNavigate={onNavigate}>
              <CompanyName e={g.group} />
            </RelRow>
          ))}
        </Section>
      )}

      {positions.length > 0 && (
        <Section title={t('panel.positions')}>
          {[...positions].sort(byName(p => p.entity?.name ?? '')).map((p, i) => (
            <RelRow key={i} node={entityToNode(p.entity)} onNavigate={onNavigate}
              rel={relFromRole(p.role, {
                     fromId: node.id, toId: p.entity.id,
                     role: p.role?.role ?? '', label: p.entity.name,
                     sourceName: sourceName.get(p.role?.source_id ?? '') })}>
              <CompanyName e={p.entity} />
              <CorroborationBadge rel={p.role} />
              <ReadingBadge rel={p.role} />
              <span className="role-badge">{p.role?.role}</span>
            </RelRow>
          ))}
        </Section>
      )}

      {formerPositions.length > 0 && (
        <Section title={t('panel.formerPositions')}>
          {[...formerPositions].sort(byTenureDesc).map((p, i) => (
            <RelRow key={i} node={entityToNode(p.entity)} onNavigate={onNavigate}
              rel={relFromRole(p.role, {
                     fromId: node.id, toId: p.entity.id,
                     role: p.role?.role ?? '', label: p.entity.name,
                     sourceName: sourceName.get(p.role?.source_id ?? '') })}>
              <CompanyName e={p.entity} />
              <CorroborationBadge rel={p.role} />
              <ReadingBadge rel={p.role} />
              <span className="role-badge role-badge--former">{p.role?.role}</span>
              <span className="rel-item__year">{tenure(p.role, t)}</span>
            </RelRow>
          ))}
        </Section>
      )}

      {holdings.length > 0 && (
        <Section title={t('panel.ownerships')}>
          {[...holdings].sort(byStakeDesc(h => h.relationship?.stake_percent, h => h.entity ? entityLabel(h.entity) : '', h => h.relationship?.shares)).map((h, i) => (
            <RelRow key={i} node={entityToNode(h.entity)} onNavigate={onNavigate}
              rel={relFromOwns(h.relationship, {
                     fromId: node.id, toId: h.entity.id, label: h.entity.name,
                     sourceName: sourceName.get(h.relationship?.source_id ?? '') })}>
              <CompanyName e={h.entity} />
              <CorroborationBadge rel={h.relationship} />
              <ReadingBadge rel={h.relationship} />
              <OwnershipBadge
                type={h.relationship?.ownership_type}
                percent={h.relationship?.stake_percent}
                votingPct={h.relationship?.voting_power_pct}
                shares={h.relationship?.shares}
              />
            </RelRow>
          ))}
        </Section>
      )}

      {raw.wikipedia_url && (
        <a className="panel-link" href={raw.wikipedia_url} target="_blank" rel="noreferrer">
          <FiExternalLink /> {t('panel.wikipedia')}
        </a>
      )}

      {/* People can be scraped now, so they can be refreshed — the same control
          the company panel has, and it was missing here purely because until
          recently there was nothing behind it for a person. */}
      {onReScrape && (
        <ReScrapeButton node={node} onReScrape={onReScrape} refreshing={refreshingId === node.id} />
      )}

      <SourcesSection sources={sources} />
      </div>
    </>
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
  label?: string
  sourceUrl?: string | null
  /** The source that asserted THIS relationship — the edge's own `source_id`
   *  resolved to a name, not the node's list. An edge is attributed to whoever
   *  created it even when several sources agree, so naming the wrong one would
   *  be worse than naming none. */
  sourceName?: string | null
  /** Every source asserting it, from the claims table — shown in the menu
   *  header when there is more than one, because "SEC EDGAR + Wikidata" answers
   *  the trust question better than either name alone. */
  assertedBy?: string[]
  /** The staleness mark: a community assertion nothing has confirmed for
   *  months. Dims the row — kept, never hidden. */
  stale?: boolean | null
  /** Companies below the owned company at any level; `descendantsBound` when
   *  the walk behind it was capped and the figure is a floor, not a count. */
  descendants?: number | null
  descendantsBound?: boolean
  /** Facts belonging to this one filing, shown in its menu rather than on the
   *  row: which security the percentage measures (a 13D/G percent is always a
   *  percent of a class), the stake and any voting bloc, and when it was
   *  filed. Too long and too rare for a row; essential once you ask. */
  shareClass?: string | null
  stake?: number | null
  votingPct?: number | null
  filedDate?: string | null
  shares?: number | null
  sharesOutstanding?: number | null
  /** when that total is from, if newer than the filing (see OwnsRelationship) */
  denominatorDate?: string | null
  /** the day the filing's numbers are as of (13D/G date of event) */
  eventDate?: string | null
  votingShares?: number | null
  /** How surely the parser read this relationship (see types.ReadFrom). Every
   *  grade is listed in the menu — the row itself badges only layout/prose. */
  readFrom?: ReadFrom | null
}


/** Where a link goes, in as few characters as will still tell you. Menus are
 *  narrow and a filing URL is not, so the host stands in for the whole thing;
 *  an unparseable value falls back to the generic label. */
export function linkHost(url?: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).host.replace(/^www\./, '') || null
  } catch {
    return null
  }
}


/** A lookup from source id to name, for `sourceName` above. */
export function sourceNames(sources: { id: string; name: string }[]): Map<string, string> {
  return new Map(sources.map(s => [s.id, s.name]))
}

/** RelTarget from an OWNS relationship — ONE camelCase mapping instead of the
 *  seven hand-copied field lists this replaces. The holdings copy had drifted
 *  (no `assertedBy`, so a person's rows never showed the multi-source header),
 *  and two other copies still carried the indentation of the block they were
 *  pasted from. A field added to OwnsRelationship now reaches every row by
 *  being added here, once. */
function relFromOwns(rel: OwnsRelationship | undefined, ids: {
  fromId: string; toId: string; label?: string; sourceName?: string | null; descendantsBound?: boolean
}): RelTarget {
  return {
    targetKind: 'owns',
    fromId: ids.fromId, toId: ids.toId, label: ids.label,
    descendants: rel?.descendants, descendantsBound: ids.descendantsBound,
    sourceUrl: rel?.source_url,
    sourceName: ids.sourceName ?? undefined,
    assertedBy: rel?.asserted_by,
    stale: rel?.stale,
    shareClass: rel?.share_class,
    stake: rel?.stake_percent,
    votingPct: rel?.voting_power_pct,
    filedDate: rel?.source_date,
    shares: rel?.shares,
    sharesOutstanding: rel?.shares_outstanding,
    denominatorDate: rel?.denominator_date,
    eventDate: rel?.event_date,
    votingShares: rel?.voting_shares,
    readFrom: rel?.read_from,
  }
}

/** RelTarget from a HAS_ROLE relationship. Role rows previously omitted
 *  `stale` and `assertedBy` although RoleRelationship carries both — so a
 *  stale or corroborated role could never dim or show its sources. */
function relFromRole(rel: RoleRelationship | undefined, ids: {
  fromId: string; toId: string; role: string; label?: string
  sourceName?: string | null
}): RelTarget {
  return {
    targetKind: 'role',
    fromId: ids.fromId, toId: ids.toId, role: ids.role, label: ids.label,
    sourceUrl: rel?.source_url,
    sourceName: ids.sourceName ?? undefined,
    assertedBy: rel?.asserted_by,
    stale: rel?.stale,
    filedDate: rel?.source_date,
    readFrom: rel?.read_from,
  }
}

/** "12", or "12+" when the walk behind the figure was capped. */
function belowText(n: number, bound?: boolean): string {
  return n.toLocaleString() + (bound && n > 0 ? '+' : '')
}

/** "· 12 below": the companies under a subsidiary at any level — what tells a
 *  holding company from a shell in a flat Exhibit 21 list, where no stake is
 *  stated. Nothing below, nothing said; the row's order is not changed by it. */
function BelowBadge({ n, bound }: { n: number | null | undefined; bound?: boolean }) {
  const { t } = useTranslation()
  if (n == null || n <= 0) return null
  return (
    <span className="rel-item__below" title={t('panel.companiesBelowHint')}>
      {t('panel.companiesBelow', { n: belowText(n, bound) })}
    </span>
  )
}

function RelRow({ node, onNavigate, rel, focusId, unknownFor, children }: {
  node: NodeData | null
  onNavigate?: (n: NodeData) => void
  rel?: RelTarget
  /** Graph node this row stands for — the graph grows it while the row is in focus. */
  focusId?: string
  /** As-of view: the year the sources do not document this relationship for —
   *  the row is dimmed like the edge on the canvas, with the reason on hover. */
  unknownFor?: string | null
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
  // Dimmed when the staleness pass has marked the assertion, with the reason on
  // hover. Still clickable, still reportable: dimming is a statement about
  // confidence, not a removal.
  const staleCls = (rel?.stale ? ' rel-item--stale' : '') + (unknownFor ? ' rel-item--unknown' : '')
  const staleTitle = unknownFor ? t('asOf.rowHint', { year: unknownFor })
                   : rel?.stale ? t('trust.staleHint') : undefined
  const focusAttr = focusId ? { [FOCUS_ATTR]: focusId } : {}
  const row = (node && node.id && onNavigate)
    ? <button type="button" className={`rel-item rel-item--clickable${staleCls}`}
              title={staleTitle} onClick={() => onNavigate(node)} {...focusAttr}>{body}</button>
    : <div className={`rel-item${staleCls}`} title={staleTitle} {...focusAttr}>{body}</div>
  if (!rel) return row

  // What this particular filing says. Each line appears only if the filing
  // stated it, so a Wikidata edge shows none of them and its menu is unchanged.
  const details: { label: string; value: string }[] = []
  if (rel.shareClass) details.push({ label: t('menu.class'), value: rel.shareClass })
  if (rel.stake != null) details.push({ label: t('menu.stake'), value: `${rel.stake}%` })
  // Only when it differs from the stake: on a lone filer the two are the same
  // number and repeating it would imply a distinction that isn't there. When it
  // exceeds the stake the row shows a ⚡ marker and nothing else, so this line
  // carries the comparison the marker stands for — Altria votes 51.9% of AB
  // InBev while holding 8.1% of it.
  if (rel.votingPct != null && rel.votingPct !== rel.stake) {
    const exceeds = rel.stake != null && rel.votingPct > rel.stake
    details.push({
      label: t('menu.voting'),
      value: exceeds ? t('menu.votingExceeds', { pct: rel.votingPct, stake: rel.stake })
                     : `${rel.votingPct}%`,
    })
  }
  // What hangs below it, at any level. Zero is said here, where the question
  // was asked, though the row stays silent about it.
  if (rel.descendants != null) {
    details.push({ label: t('menu.below'), value: belowText(rel.descendants, rel.descendantsBound) })
  }
  // The count, and the total it is a fraction of. Shown under the stake so the
  // percentage above can be checked rather than taken on trust.
  if (rel.shares != null) {
    const n = rel.shares.toLocaleString()
    details.push({
      label: t('menu.shares'),
      // A total newer than the filing says so: the count is the filing's,
      // the total (and with it the stake above) the issuer's latest.
      value: rel.sharesOutstanding != null
        ? t(rel.denominatorDate ? 'menu.sharesOfAsOf' : 'menu.sharesOf',
            { shares: n, total: rel.sharesOutstanding.toLocaleString(),
              date: rel.denominatorDate?.slice(0, 10) })
        : n,
    })
  }
  // The bloc's own count, under the percentage it produces. Its own line
  // rather than folded into the Voting one, which already carries a
  // comparison and would become unreadable.
  if (rel.votingShares != null) {
    details.push({ label: t('menu.votingShares'),
                   value: rel.votingShares.toLocaleString() })
  }
  // The day the numbers were true, above the day they were said — only when
  // the filing states one and it differs (a 13G/A of a quarter-end, filed weeks on).
  const asOf = rel.eventDate?.slice(0, 10), filed = rel.filedDate?.slice(0, 10)
  if (asOf && asOf !== filed) details.push({ label: t('menu.asOf'), value: asOf })
  if (filed) details.push({ label: t('menu.filed'), value: filed })
  // How surely it was read. The row badges only the two weak grades; the menu
  // names every one, so a reader can see that a silent row is a structured
  // field and not merely ungraded.
  if (rel.readFrom) details.push({ label: t('menu.readFrom'), value: t(`trust.readFrom.${rel.readFrom}`) })

  // Provenance first, then the record, then the complaint — the order you would
  // read it in: where did this come from, let me see it, this is wrong.
  const items = [
    // Omitted rather than disabled when the relationship has no record to open:
    // a dead menu item invites a click that does nothing.
    ...(rel.sourceUrl ? [{
      key: 'source',
      label: linkHost(rel.sourceUrl) ?? t('menu.viewSource'),
      icon: <FiExternalLink size={12} />,
      onSelect: () => window.open(rel.sourceUrl as string, '_blank', 'noopener,noreferrer'),
    }] : []),
    { key: 'report', label: t('menu.reportRelationship'), icon: <FiFlag size={12} />,
      onSelect: () => setReporting(true) },
  ]

  return (
    <div className="rel-row" {...press}>
      {row}
      <ActionMenu items={items} details={details}
                  header={(rel.assertedBy && rel.assertedBy.length > 1
                            ? rel.assertedBy.join(' + ')
                            : rel.sourceName) || undefined}
                  position={menuAt} onClose={() => setMenuAt(null)} />
      {reporting && (
        <ReportModal targetKind={rel.targetKind} targetLabel={rel.label ?? ''}
                     fromId={rel.fromId} toId={rel.toId} role={rel.role}
                     onClose={() => setReporting(false)} />
      )}
    </div>
  )
}

/** The subsidiary list in "all levels" mode: the whole tree, depth-first, each
 *  company indented under its parent. Siblings in the panel's usual order
 *  (largest stake first, then by name). The count is the tree's companies; a
 *  truncated tree says so the way a capped section does. */
function SubsidiaryTreeList({ tree, onNavigate, sourceName, asOf = null }: {
  tree: SubsidiaryTree
  onNavigate?: (node: NodeData) => void
  sourceName: Map<string, string>
  /** Time travel: rows the sources do not document for the day are dimmed. */
  asOf?: string | null
}) {
  const { t, i18n } = useTranslation()
  const places = useMemo(() => namesakeCountries(tree.nodes.map(n => n.entity), i18n.language),
                         [tree, i18n.language])
  const rows = useMemo(() => {
    const relOf = new Map(tree.edges.map(e => [`${e.from_id}\u0000${e.to_id}`, e.relationship]))
    const kids = new Map<string, SubsidiaryTree['nodes']>()
    for (const n of tree.nodes) {
      if (!kids.has(n.parent_id)) kids.set(n.parent_id, [])
      kids.get(n.parent_id)!.push(n)
    }
    const rel = (n: SubsidiaryTree['nodes'][number]) => relOf.get(`${n.parent_id}\u0000${n.entity.id}`)
    const order = byStakeDesc<SubsidiaryTree['nodes'][number]>(
      n => rel(n)?.stake_percent, n => entityLabel(n.entity), n => rel(n)?.shares)
    const out: { node: SubsidiaryTree['nodes'][number]; rel: OwnsRelationship | undefined }[] = []
    const walk = (parentId: string) => {
      for (const n of [...(kids.get(parentId) ?? [])].sort(order)) {
        out.push({ node: n, rel: rel(n) })
        walk(n.entity.id)
      }
    }
    walk(tree.root_id)
    return out
  }, [tree])

  return (
    <Section title={t('panel.subsidiariesAllLevels')} count={tree.nodes.length}>
      {rows.map(({ node: n, rel }) => (
        <div key={n.entity.id} className="rel-tree__row" data-depth={n.depth}
             style={{ paddingLeft: `${(n.depth - 1) * 14}px` }}>
          <RelRow node={entityToNode(n.entity)} onNavigate={onNavigate} focusId={n.entity.id}
            unknownFor={asOf && rowPresence(n.entity, rel, asOf) === 'unknown' ? asOfYear(asOf) : null}
            rel={relFromOwns(rel, { fromId: n.parent_id, toId: n.entity.id, label: n.entity.name,
                                    sourceName: sourceName.get(rel?.source_id ?? ''),
                                    descendantsBound: tree.truncated })}>
            <CompanyName e={n.entity} place={places.get(n.entity.id)} />
            <BelowBadge n={rel?.descendants} bound={tree.truncated} />
            <OwnershipBadge type={rel?.ownership_type} percent={rel?.stake_percent} shares={rel?.shares} />
          </RelRow>
        </div>
      ))}
      {tree.truncated && (
        <div className="panel-section__cut" role="note">{t('toast.treeTruncated', { count: tree.nodes.length })}</div>
      )}
    </Section>
  )
}

interface EntityOverviewProps {
  profile: FullProfile
  sources: Source[]
  stakeFilter?: StakeFilter
  /** The whole subsidiary tree ("all levels"); null = the flat list of direct holdings. */
  tree?: SubsidiaryTree | null
  asOf?: string | null
  onExportPng?: () => void
  /** The company's spreadsheet, built server-side; given the entity's id. */
  onExportSpreadsheet?: (entityId: string) => void
  onViewOnMap?: () => void
  onShare?: () => void
  onNavigate?: (node: NodeData) => void
  node: NodeData
  onReScrape?: (node: NodeData) => void
  refreshingId?: string | null
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
        // "SEC EDGAR · 13F" — a source can contribute several KINDS of record
        // (a 13G stake beside a 13F position), and the kind is what tells a
        // reader which register rules the fact lives under.
        const label = s.filing_type ? `${s.name} · ${s.filing_type}` : s.name
        // The reading grade, only when it is worth a hint (layout / prose /
        // narrative) — the same silence on the normal case as the row badges keep.
        const grade = readingGrade(s.read_from)
        return (
          <div key={`${s.id}-${s.url ?? ''}-${i}`} className="source-item">
            <div className="source-item__header">
              {s.url
                ? <a className="source-item__name" href={s.url} target="_blank" rel="noreferrer">
                    <FiExternalLink size={11} /> {label}
                  </a>
                : <span className="source-item__name">{label}</span>
              }
              {grade && (
                <span className={`reading-badge reading-badge--${grade}`}
                      title={t(`trust.readFromHint.${grade}`)}>
                  {t(`trust.readFrom.${grade}`)}
                </span>
              )}
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

function EntityOverview({ profile, sources, onExportPng, onExportSpreadsheet, onViewOnMap, onShare, onNavigate, node, onReScrape, refreshingId, stakeFilter = ANY_STAKE, tree = null, asOf = null }: EntityOverviewProps) {
  const { t, i18n } = useTranslation()
  const { entity, counts, owners = [], subsidiaries = [], executives = [], dual_listed = [],
          succeeded_by = [], replaces = [], ownership, cross_holdings = [],
          group_members: groupParties = [] } = profile
  // Which source asserted each relationship, for the row menu's header — the
  // edge's own source_id, not the node's source list.
  const sourceName = sourceNames(sources)
  // the legal name and the register's Latin one, in the viewer's order
  const names = displayName(entity)

  // The stake filter shared with the graph hides small DISCLOSED holdings from
  // the list too (undisclosed stakes are kept — keepsEdge keeps null). The
  // section count stays the server total, as it already does for capped lists.
  // In the as-of view a row absent on the day (the server already drops those,
  // but a party founded later is decided here) goes; one the sources do not
  // document for the day stays, dimmed — the same answer the canvas gives.
  const unknownYear = asOf ? asOfYear(asOf) : null
  const ownersShown = owners
    .filter(o => keepsEdge(effectiveStakePct(o.relationship?.stake_percent, o.relationship?.shares, o.relationship?.shares_outstanding), stakeFilter))
    .filter(o => rowPresence(o.owner, o.relationship, asOf) !== 'absent')
  // A person owner is never a namesake company; only entities can carry a country
  const ownerPlaces = namesakeCountries(
    ownersShown.map(o => (o.owner && 'name' in o.owner ? o.owner : null)), i18n.language)
  const subsidiariesShown = subsidiaries
    .filter(s => keepsEdge(effectiveStakePct(s.relationship?.stake_percent, s.relationship?.shares, s.relationship?.shares_outstanding), stakeFilter))
    .filter(s => rowPresence(s.entity, s.relationship, asOf) !== 'absent')
  const unknownRow = (party: Entity | Person | null | undefined, rel: Tenure | null | undefined) =>
    unknownYear && rowPresence(party, rel, asOf) === 'unknown' ? unknownYear : null
  // The stored direct-thumb URL (upload.wikimedia.org — the host that works
  // where Special:FilePath's new redirect does not, e.g. mobile), resolved
  // server-side during the scrape. No client-side lookup: still-dev data, so
  // an entity without logo_url simply has no logo until its next scrape.
  // safeHref-gated because logo_url is scraped data going into src.
  const imgSrc = safeHref(entity.logo_url ?? null)

  // Surface founders in their own section rather than buried among executives.
  const seenFounders = new Set<string>()
  const executivesShown = executives.filter(e => edgePresence(e.role, asOf) !== 'absent')
  const founders = executivesShown.filter(e => {
    if (e.role?.role !== 'Founder' || seenFounders.has(e.person.id)) return false
    seenFounders.add(e.person.id)
    return true
  })
  const otherExecutives = executivesShown.filter(e => e.role?.role !== 'Founder')

  // The panel's only branch on entity type. A voting group's "owners" are the
  // parties to the agreement and its "subsidiaries" are the company the bloc
  // controls — the sections hold the right things, only their titles would lie.
  const isGroup = entity.type === 'voting_group'

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
  const webRow    = webLinkRow(entity)

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
        <h2 className="panel-name">{names.primary}</h2>
        <NodeActions label={names.primary} nodeId={entity.id} targetKind="entity" onShare={onShare} />
      </div>
      {names.secondary && (
        // The other name, and which it is: the legal name is what the
        // register files the company under; the Latin one is the register's
        // own, stated beside it — nothing here is translated.
        <p className="panel-name-alt">
          <span className="panel-name-alt__name">{names.secondary}</span>
          <span className="panel-name-alt__kind">{t(names.secondaryKind === 'legal' ? 'panel.legalName' : 'panel.latinName')}</span>
        </p>
      )}
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
        {webRow && (
          <MetaRow icon={webRow.icon} label={t(webRow.labelKey)}
                   value={webRow.value} href={webRow.href} />
        )}
      </div>

      {/* Right under the facts at the top: the rest of them (collapsed), then who
          founded it — both are about the company itself, before who holds what. */}
      <DetailsSection entity={entity} hasOwners={owners.length > 0} />
      {founders.length > 0 && (
        <Section title={t('panel.foundedBy')} count={founders.length}>
          {[...founders].sort(byName(f => f.person?.full_name ?? '')).map((f, i) => (
            <RelRow key={i} node={personToNode(f.person)} onNavigate={onNavigate}
              rel={relFromRole(f.role, {
                     fromId: f.person.id, toId: entity.id,
                     role: f.role?.role || 'Founder', label: f.person.full_name,
                     sourceName: sourceName.get(f.role?.source_id ?? '') })}>
              <span className="rel-item__name">{f.person.full_name}</span>
              <CorroborationBadge rel={f.role} />
              <ReadingBadge rel={f.role} />
            </RelRow>
          ))}
        </Section>
      )}

      {/* Parties to a filing group. Their own section because membership is not
          ownership — they arrive over RELATED_TO, and the owners query cannot
          see them, which is how this section first shipped empty. */}
      {isGroup && (groupParties?.length ?? 0) > 0 && (
        <Section title={t('panel.groupMembers')}>
          {groupParties!.map((m, i) => (
            <RelRow key={i}
                    node={m.kind === 'person'
                            ? personToNode(m.party as Person)
                            : entityToNode(m.party as Entity)}
                    onNavigate={onNavigate}>
              <span className="rel-item__name">{m.kind === 'person' ? (m.party as Person).full_name : entityLabel(m.party as Entity)}</span>
            </RelRow>
          ))}
        </Section>
      )}

      {ownersShown.length > 0 && (
        <Section title={t('panel.ownedBy')} count={counts?.owners} shown={owners.length}>
          {[...ownersShown].sort(byStakeDesc(
            o => o.relationship?.stake_percent,
            o => o.owner ? ownerName(o.owner) : '',
            o => o.relationship?.shares,
          )).map((o, i) => (
            <RelRow key={i} node={o.owner ? ownerToNode(o.owner) : null} onNavigate={onNavigate}
              focusId={o.owner?.id} unknownFor={unknownRow(o.owner, o.relationship)}
              rel={o.owner
                ? relFromOwns(o.relationship, {
                    fromId: o.owner.id, toId: entity.id,
                    label: ownerName(o.owner),
                    sourceName: sourceName.get(o.relationship?.source_id ?? '') })
                : undefined}>
              <span className="rel-item__name"
                    title={o.owner && 'name' in o.owner ? displayName(o.owner).secondary ?? undefined : undefined}>
                {o.owner ? ownerName(o.owner) : '—'}
                {o.owner && ownerPlaces.has(o.owner.id) && (
                  <span className="rel-item__place"> ({ownerPlaces.get(o.owner.id)})</span>
                )}
                {o.owner && 'name' in o.owner && o.owner.is_nominee && (
                  <span className="nominee-badge" title={t('panel.nomineeHint')}>{t('panel.nominee')}</span>
                )}
              </span>
              <CorroborationBadge rel={o.relationship} />
              <ReadingBadge rel={o.relationship} />
              <OwnershipBadge
                type={o.relationship?.ownership_type}
                percent={o.relationship?.stake_percent}
                shares={o.relationship?.shares}
                // Not on a voting group's own row: "this voting group votes more
                // than it owns" is what a voting group is. The bloc figure is in
                // the row's menu, where it says something.
                votingPct={(o.owner as { type?: string })?.type === 'voting_group'
                             ? null : o.relationship?.voting_power_pct}
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
          {/* Several securities, several denominators — so there is no total to
              show. Say that in place of the total rather than listing per-class
              figures: the class titles are long, and normalisation deliberately
              over-splits them (Televisa names its CPOs four ways), which makes
              a list read as more classes than the company has. Which security a
              given percentage measures is on that relationship's own menu. */}
          {ownership?.multi_class && (
            <div className="ownership-note">{t('panel.multiClassHint')}</div>
          )}
        </Section>
      )}

      {cross_holdings.length > 0 && (
        <Section title={t('panel.crossHoldings')}>
          <div className="ownership-warning">↻ {t('panel.crossHoldingsHint')}</div>
          {[...cross_holdings].sort(byName(c => c.name ?? '')).map((c, i) => (
            <RelRow key={i} node={entityToNode(c)} onNavigate={onNavigate}>
              <CompanyName e={c} />
            </RelRow>
          ))}
        </Section>
      )}

      {dual_listed.length > 0 && (
        <Section title={t('panel.dualListedWith')}>
          {[...dual_listed].sort(byName(d => d.name ?? '')).map((d, i) => (
            <RelRow key={i} node={entityToNode(d)} onNavigate={onNavigate}>
              <CompanyName e={d} />
            </RelRow>
          ))}
        </Section>
      )}

      {succeeded_by.length > 0 && (
        <Section title={t('panel.succeededBy')}>
          {[...succeeded_by].sort(byName(s => s.name ?? '')).map((s, i) => (
            <RelRow key={i} node={entityToNode(s)} onNavigate={onNavigate}>
              <CompanyName e={s} />
              {s.since && <span className="rel-item__year">{s.since.slice(0, 4)}</span>}
            </RelRow>
          ))}
        </Section>
      )}

      {replaces.length > 0 && (
        <Section title={t('panel.replaces')}>
          {[...replaces].sort(byName(p => p.name ?? '')).map((p, i) => (
            <RelRow key={i} node={entityToNode(p)} onNavigate={onNavigate}>
              <CompanyName e={p} />
              {p.since && <span className="rel-item__year">{p.since.slice(0, 4)}</span>}
            </RelRow>
          ))}
        </Section>
      )}

      {tree && tree.nodes.length > 0 && (
        <SubsidiaryTreeList tree={tree} onNavigate={onNavigate} sourceName={sourceName} asOf={asOf} />
      )}
      {!(tree && tree.nodes.length > 0) && subsidiariesShown.length > 0 && (
        <Section title={isGroup ? t('panel.groupControls') : t('panel.subsidiaries')}
                 count={counts?.subsidiaries} shown={subsidiaries.length}>
          {(() => {
            const sorted = [...subsidiariesShown].sort(
              byStakeDesc(s => s.relationship?.stake_percent, s => s.entity ? entityLabel(s.entity) : '',
                          s => s.relationship?.shares))
            const places = namesakeCountries(sorted.map(s => s.entity), i18n.language)
            const row = (s: SubsidiaryEntry, i: number) => (
              <RelRow key={i} node={entityToNode(s.entity)} onNavigate={onNavigate}
                focusId={s.entity.id} unknownFor={unknownRow(s.entity, s.relationship)}
                rel={relFromOwns(s.relationship, {
                       fromId: entity.id, toId: s.entity.id, label: s.entity.name,
                       sourceName: sourceName.get(s.relationship?.source_id ?? ''),
                       descendantsBound: profile.descendants_truncated })}>
                <CompanyName e={s.entity} place={places.get(s.entity.id)} />
                <CorroborationBadge rel={s.relationship} />
                <ReadingBadge rel={s.relationship} />
                {/* Before the ownership badge: the row ends on the stake, as every row does. */}
                <BelowBadge n={s.relationship?.descendants} bound={profile.descendants_truncated} />
                {/* The marker belongs on this side too. Altria's panel lists AB
                    InBev as something it holds 8.1% of — while voting 51.9% —
                    and without this the disproportion is visible only from AB
                    InBev's side. Suppressed on a voting group's own panel for
                    the same reason it is suppressed on its row: "this voting
                    group's control is voting" says nothing. */}
                <OwnershipBadge type={s.relationship?.ownership_type}
                                percent={s.relationship?.stake_percent}
                                shares={s.relationship?.shares}
                                votingPct={isGroup ? null : s.relationship?.voting_power_pct} />
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
        // counts.executives counts every current HAS_ROLE person, founders
        // included — but this list renders otherExecutives, so the raw count
        // over-stated it whenever founders existed.
        <Section title={t('panel.executives')}
                 count={counts?.executives != null
                          ? Math.max(counts.executives - founders.length, 0)
                          : undefined}>
          {[...otherExecutives].sort(byRoleImportance(e => e.role?.role, e => e.person?.full_name ?? '')).map((e, i) => (
            <RelRow key={i} node={personToNode(e.person)} onNavigate={onNavigate}
              unknownFor={unknownRow(e.person, e.role)}
              rel={relFromRole(e.role, {
                     fromId: e.person.id, toId: entity.id,
                     role: e.role?.role ?? '', label: e.person.full_name,
                     sourceName: sourceName.get(e.role?.source_id ?? '') })}>
              <span className="rel-item__name">{e.person.full_name}</span>
              <CorroborationBadge rel={e.role} />
              <ReadingBadge rel={e.role} />
              <span className="role-badge">{e.role?.role}</span>
            </RelRow>
          ))}
        </Section>
      )}

      {onReScrape && (
        <ReScrapeButton node={node} onReScrape={onReScrape} refreshing={refreshingId === node.id} />
      )}
      <SourcesSection sources={sources} />
      <SourceStatements ids={entity.source_statement_ids} />

      {(onExportPng || onExportSpreadsheet) && (
        <div className="panel-export">
          {onExportPng && (
            <button className="panel-export__btn" onClick={onExportPng}>
              <FiDownload /> {t('graph.exportPng')}
            </button>
          )}
          {onExportSpreadsheet && (
            <button className="panel-export__btn" onClick={() => onExportSpreadsheet(profile.entity.id)}>
              <FiDownload /> {t('graph.exportOds')}
            </button>
          )}
        </div>
      )}

    </div>
  )
}

function PanelTabs({ active, onChange }: { active: string; onChange: (tab: string) => void }) {
  const { t } = useTranslation()
  // Switching views deep in a long list left the reader mid-way down the
  // other view; a tab click starts the new view at its top.
  const pick = (tab: string) => (e: { currentTarget: HTMLElement }) => {
    onChange(tab)
    scrollingPanel(e.currentTarget)?.scrollTo({ top: 0 })
  }
  return (
    <div className="panel-tabs">
      <button
        className={`panel-tab ${active === 'overview' ? 'panel-tab--active' : ''}`}
        onClick={pick('overview')}
      >
        <FiList /> {t('panel.overview')}
      </button>
      <button
        className={`panel-tab ${active === 'timeline' ? 'panel-tab--active' : ''}`}
        onClick={pick('timeline')}
      >
        <FiClock /> {t('panel.timeline')}
      </button>
    </div>
  )
}

export default function NodePanel({ node, onExportPng, onExportSpreadsheet, onViewOnMap, onShare, onNavigate, onReScrape, refreshingId, refreshKey, stakeFilter = ANY_STAKE, allLevels = false, asOf = null, onYearSelect, onGraphFocus, graphFocusMode = 'hover', graphHoverId = null, graphFocusId = null }: NodePanelProps) {
  const { t } = useTranslation()
  const [profile,    setProfile]    = useState<FullProfile | null>(null)
  const [sources,    setSources]    = useState<Source[]>([])
  const [tree,       setTree]       = useState<SubsidiaryTree | null>(null)
  const [loading,    setLoading]    = useState<boolean>(false)
  const [activeView, setActiveView] = useState<string>('overview')
  const prevIdRef = useRef<string | null>(null)
  const focusScopeRef = useRef<HTMLDivElement>(null)
  useGraphFocus(focusScopeRef, graphFocusMode, onGraphFocus, [node?.id, profile, activeView, loading])
  useGraphHoverHighlight(focusScopeRef, graphHoverId, [node?.id, profile, activeView, loading])
  useGraphFocusHighlight(focusScopeRef, graphFocusId, [node?.id, profile, activeView, loading])

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
      getFullProfile(node.id, asOf),
      getEntitySources(node.id).catch(() => ({ data: [] as Source[] })),
      // The tree only in "all levels" mode; its failure leaves the flat list.
      allLevels ? getSubsidiaryTree(node.id, asOf).then(r => r.data).catch(() => null) : Promise.resolve(null),
    ])
      .then(([{ data: prof }, { data: srcs }, subTree]) => {
        if (!active) return
        setProfile(prof)
        setSources(srcs)
        setTree(subTree)
      })
      .catch(() => { if (active && idChanged) setProfile(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [node?.id, refreshKey, allLevels, asOf]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) {
    return (
      <div className="panel-empty">
        <div className="panel-empty-icon">◈</div>
        <p>{t('panel.empty').split('\n').map((line, i) => <span key={i}>{line}{i === 0 && <br />}</span>)}</p>
      </div>
    )
  }

  if (node.nodeType === 'person') {
    return <PersonView refreshingId={refreshingId} node={node} onNavigate={onNavigate} onShare={onShare} asOf={asOf}
                       onReScrape={onReScrape} stakeFilter={stakeFilter} />
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
        ? <div ref={focusScopeRef}>
            <EntityOverview refreshingId={refreshingId} profile={profile} sources={sources} node={node} onReScrape={onReScrape} onExportPng={onExportPng} onExportSpreadsheet={onExportSpreadsheet} onViewOnMap={onViewOnMap} onShare={onShare} onNavigate={onNavigate} stakeFilter={stakeFilter} tree={tree} asOf={asOf} />
          </div>
        : <TimelinePanel entityId={profile.entity.id} asOf={asOf} onYearSelect={onYearSelect} />}
    </>
  )
}
