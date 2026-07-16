import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FiMapPin, FiCalendar, FiDollarSign, FiExternalLink, FiList, FiClock, FiDownload, FiShield, FiChevronRight, FiChevronDown, FiFlag, FiTag } from 'react-icons/fi'
import { getFullProfile, getEntitySources, getPersonProfile } from '../services/api'
import { countryName } from '../utils/isoCountries'
import OwnershipBadge from './OwnershipBadge'
import TimelinePanel  from './TimelinePanel'
import type { NodeData, FullProfile, PersonProfile, Person, Entity, Source } from '../types'

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
    born: formatProvenanceDate(p.birth_date),
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

interface NodePanelProps {
  node: NodeData | null
  onExportPng?: () => void
  onExportCsv?: () => void
  onViewOnMap?: () => void
  onNavigate?: (node: NodeData) => void
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel-section">
      <h4 className="panel-section__title">{title}</h4>
      {children}
    </div>
  )
}

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

function PersonView({ node, onNavigate }: { node: NodeData; onNavigate?: (n: NodeData) => void }) {
  const raw = node.raw as Person
  const { t, i18n } = useTranslation()
  const imgSrc = usePersonImage(raw.full_name, raw.wikipedia_url)
  const { born, died, nationalities, aka } = personDisplayDetails(raw, i18n.language)

  // A person's positions (HAS_ROLE) and ownerships (OWNS) already exist in the
  // graph — fetch them so the panel shows what they hold, not just their bio.
  const [profile, setProfile] = useState<PersonProfile | null>(null)
  useEffect(() => {
    let active = true
    setProfile(null)
    getPersonProfile(node.id)
      .then(({ data }) => { if (active) setProfile(data) })
      .catch(() => { if (active) setProfile(null) })
    return () => { active = false }
  }, [node.id])
  const positions = profile?.positions ?? []
  const holdings  = profile?.holdings ?? []

  return (
    <div className="panel-body">
      {imgSrc && (
        <img className="panel-avatar" src={imgSrc} alt={raw.full_name} />
      )}
      <span className="node-type-badge node-type-badge--person">{t('legend.person')}</span>
      <h2 className="panel-name">{raw.full_name}</h2>
      {raw.description && <p className="panel-desc">{raw.description}</p>}
      <div className="panel-meta">
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

      {positions.length > 0 && (
        <Section title={t('panel.positions')}>
          {positions.map((p, i) => (
            <RelRow key={i} node={entityToNode(p.entity)} onNavigate={onNavigate}>
              <span className="rel-item__name">{p.entity.name}</span>
              <span className="role-badge">{p.role?.role}</span>
            </RelRow>
          ))}
        </Section>
      )}

      {holdings.length > 0 && (
        <Section title={t('panel.ownerships')}>
          {holdings.map((h, i) => (
            <RelRow key={i} node={entityToNode(h.entity)} onNavigate={onNavigate}>
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

      {raw.wikipedia_url && (
        <a className="panel-link" href={raw.wikipedia_url} target="_blank" rel="noreferrer">
          <FiExternalLink /> {t('panel.wikipedia')}
        </a>
      )}
    </div>
  )
}

// A relationship row. Clickable (navigates like a graph node) when onNavigate
// and a resolvable target node are provided; otherwise a plain row.
function RelRow({ node, onNavigate, children }: {
  node: NodeData | null
  onNavigate?: (n: NodeData) => void
  children: React.ReactNode
}) {
  if (node && node.id && onNavigate) {
    return (
      <button type="button" className="rel-item rel-item--clickable" onClick={() => onNavigate(node)}>
        {children}
      </button>
    )
  }
  return <div className="rel-item">{children}</div>
}

interface EntityOverviewProps {
  profile: FullProfile
  sources: Source[]
  onExportPng?: () => void
  onExportCsv?: () => void
  onViewOnMap?: () => void
  onNavigate?: (node: NodeData) => void
}

function credibilityColor(score: number): string {
  if (score >= 70) return '#2ECC71'
  if (score >= 40) return '#F39C12'
  return '#E74C3C'
}

function EntityOverview({ profile, sources, onExportPng, onExportCsv, onViewOnMap, onNavigate }: EntityOverviewProps) {
  const { t, i18n } = useTranslation()
  const { entity, headquarters, owners = [], subsidiaries = [], executives = [], dual_listed = [] } = profile
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

  // HQ location: prefer a linked headquarters Location, fall back to the
  // coordinates/city denormalized onto the entity by the scrapers.
  const hqCity    = headquarters?.city    || entity.hq_city
  const hqCountry = headquarters?.country || entity.hq_country
  const hqText    = [hqCity, hqCountry && countryName(hqCountry, i18n.language)].filter(Boolean).join(', ')

  // Dual-listed companies have multiple domiciles / HQs.
  const countryList = (entity.countries?.length ? entity.countries : (entity.country ? [entity.country] : []))
    .map(c => countryName(c, i18n.language))
  const hqList = (entity.hq_locations?.length
    ? entity.hq_locations.map(loc => {
        const [city, cc] = loc.split('|')
        return [city, cc && countryName(cc, i18n.language)].filter(Boolean).join(', ')
      })
    : (hqText ? [hqText] : []))

  const address   = headquarters
    ? [headquarters.street, headquarters.city, headquarters.state, headquarters.zip, headquarters.country]
        .filter(Boolean).join(', ')
    : ''
  const hasCoords = entity.hq_lat != null && entity.hq_lng != null

  return (
    <div className="panel-body">
      {imgSrc && (
        <img className="panel-logo" src={imgSrc} alt={entity.name} />
      )}
      <span className={`node-type-badge node-type-badge--${entity.type || 'company'}`}>
        {t(`legend.${entity.type || 'company'}`, { defaultValue: entity.type || 'company' })}
      </span>
      <h2 className="panel-name">{entity.name}</h2>
      {entity.description && <p className="panel-desc">{entity.description}</p>}

      <div className="panel-meta">
        <MetaRow icon={FiMapPin}     label={countryList.length > 1 ? t('panel.countries') : t('panel.country')} value={countryList.join(', ') || null} />
        <MetaRow icon={FiCalendar}   label={t('panel.founded')}  value={entity.founded} />
        <MetaRow icon={FiDollarSign} label={t('panel.revenue')}  value={entity.revenue != null ? fmt(entity.revenue) : null} />
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
          {owners.map((o, i) => (
            <RelRow key={i} node={o.owner ? ownerToNode(o.owner) : null} onNavigate={onNavigate}>
              <span className="rel-item__name">{o.owner ? ('name' in o.owner ? o.owner.name : o.owner.full_name) : '—'}</span>
              <OwnershipBadge
                type={o.relationship?.ownership_type}
                percent={o.relationship?.stake_percent}
                votingPct={o.relationship?.voting_power_pct}
              />
            </RelRow>
          ))}
        </Section>
      )}

      {dual_listed.length > 0 && (
        <Section title={t('panel.dualListedWith')}>
          {dual_listed.map((d, i) => (
            <RelRow key={i} node={entityToNode(d)} onNavigate={onNavigate}>
              <span className="rel-item__name">{d.name}</span>
            </RelRow>
          ))}
        </Section>
      )}

      {founders.length > 0 && (
        <Section title={t('panel.foundedBy')}>
          {founders.map((f, i) => (
            <RelRow key={i} node={personToNode(f.person)} onNavigate={onNavigate}>
              <span className="rel-item__name">{f.person.full_name}</span>
            </RelRow>
          ))}
        </Section>
      )}

      {subsidiaries.length > 0 && (
        <Section title={t('panel.subsidiaries')}>
          {subsidiaries.map((s, i) => (
            <RelRow key={i} node={entityToNode(s.entity)} onNavigate={onNavigate}>
              <span className="rel-item__name">{s.entity.name}</span>
              <OwnershipBadge type={s.relationship?.ownership_type} percent={s.relationship?.stake_percent} />
            </RelRow>
          ))}
        </Section>
      )}

      {otherExecutives.length > 0 && (
        <Section title={t('panel.executives')}>
          {otherExecutives.map((e, i) => (
            <RelRow key={i} node={personToNode(e.person)} onNavigate={onNavigate}>
              <span className="rel-item__name">{e.person.full_name}</span>
              <span className="role-badge">{e.role?.role}</span>
            </RelRow>
          ))}
        </Section>
      )}

      {sources.length > 0 && (
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
          )})}
        </CollapsibleSection>
      )}

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

export default function NodePanel({ node, onExportPng, onExportCsv, onViewOnMap, onNavigate }: NodePanelProps) {
  const { t } = useTranslation()
  const [profile,    setProfile]    = useState<FullProfile | null>(null)
  const [sources,    setSources]    = useState<Source[]>([])
  const [loading,    setLoading]    = useState<boolean>(false)
  const [activeView, setActiveView] = useState<string>('overview')

  useEffect(() => {
    if (!node || node.nodeType !== 'entity') {
      setProfile(null)
      setSources([])
      return
    }
    setActiveView('overview')
    setLoading(true)
    setProfile(null)
    setSources([])
    Promise.all([
      getFullProfile(node.id),
      getEntitySources(node.id).catch(() => ({ data: [] as Source[] })),
    ])
      .then(([{ data: prof }, { data: srcs }]) => {
        setProfile(prof)
        setSources(srcs)
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }, [node?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) {
    return (
      <div className="panel-empty">
        <div className="panel-empty-icon">◈</div>
        <p>{t('panel.empty').split('\n').map((line, i) => <span key={i}>{line}{i === 0 && <br />}</span>)}</p>
      </div>
    )
  }

  if (node.nodeType === 'person') return <PersonView node={node} onNavigate={onNavigate} />

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
        ? <EntityOverview profile={profile} sources={sources} onExportPng={onExportPng} onExportCsv={onExportCsv} onViewOnMap={onViewOnMap} onNavigate={onNavigate} />
        : <TimelinePanel entityId={profile.entity.id} />}
    </>
  )
}
