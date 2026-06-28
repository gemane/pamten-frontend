import { useState, useEffect } from 'react'
import { FiMapPin, FiCalendar, FiDollarSign, FiExternalLink, FiNavigation, FiList, FiClock, FiLoader, FiPlusCircle } from 'react-icons/fi'
import { getFullProfile } from '../services/api'
import OwnershipBadge from './OwnershipBadge'
import TimelinePanel  from './TimelinePanel'
import type { NodeData, FullProfile, Person, Entity } from '../types'

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
          const val = claims?.[prop]?.[0]?.mainsnak?.datavalue?.value
          if (val) {
            const filename = (val as string).replace(/ /g, '_')
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
  onExpand: (id: string) => void
  expandingId: string | null
  onNavigateTo?: (nodeData: NodeData) => void
  centerId?: string | null
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

function PersonView({ raw, onNavigateTo, isCenter }: { raw: Person; onNavigateTo?: (nodeData: NodeData) => void; isCenter?: boolean }) {
  const imgSrc = usePersonImage(raw.full_name, raw.wikipedia_url)
  return (
    <div className="panel-body">
      {imgSrc && (
        <img className="panel-avatar" src={imgSrc} alt={raw.full_name} />
      )}
      <span className="node-type-badge node-type-badge--person">Person</span>
      <h2 className="panel-name">{raw.full_name}</h2>
      {raw.description && <p className="panel-desc">{raw.description}</p>}
      <div className="panel-meta">
        <MetaRow icon={FiMapPin} label="Nationality" value={raw.nationality} />
      </div>
      {raw.wikipedia_url && (
        <a className="panel-link" href={raw.wikipedia_url} target="_blank" rel="noreferrer">
          <FiExternalLink /> Wikipedia
        </a>
      )}
      {!isCenter && onNavigateTo && (
        <button
          className="expand-btn"
          onClick={() => onNavigateTo({ id: raw.id, label: raw.full_name, nodeType: 'person', raw })}
        >
          <FiNavigation /> Open as center
        </button>
      )}
    </div>
  )
}

interface EntityOverviewProps {
  profile: FullProfile
  onExpand: (id: string) => void
  expandingId: string | null
  onNavigateTo?: (nodeData: NodeData) => void
  isCenter?: boolean
}

function EntityOverview({ profile, onExpand, expandingId, onNavigateTo, isCenter }: EntityOverviewProps) {
  const { entity, headquarters, owners = [], subsidiaries = [], executives = [] } = profile
  const imgSrc = useWikidataImage(entity.wikidata_id)

  const fmt = (n: number) =>
    n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${n}`

  return (
    <div className="panel-body">
      {imgSrc && (
        <img className="panel-logo" src={imgSrc} alt={entity.name} />
      )}
      <span className={`node-type-badge node-type-badge--${entity.type || 'company'}`}>
        {entity.type || 'company'}
      </span>
      <h2 className="panel-name">{entity.name}</h2>
      {entity.description && <p className="panel-desc">{entity.description}</p>}

      <div className="panel-meta">
        <MetaRow icon={FiMapPin}     label="Country"  value={entity.country} />
        <MetaRow icon={FiCalendar}   label="Founded"  value={entity.founded} />
        <MetaRow icon={FiDollarSign} label="Revenue"  value={entity.revenue != null ? fmt(entity.revenue) : null} />
        {headquarters && (
          <MetaRow icon={FiMapPin} label="HQ" value={`${headquarters.city}, ${headquarters.country}`} />
        )}
      </div>

      {owners.length > 0 && (
        <Section title="Owned by">
          {owners.map((o, i) => (
            <div key={i} className="rel-item">
              <span className="rel-item__name">{o.owner ? ('name' in o.owner ? o.owner.name : o.owner.full_name) : '—'}</span>
              <OwnershipBadge
                type={o.relationship?.ownership_type}
                percent={o.relationship?.stake_percent}
                votingPct={o.relationship?.voting_power_pct}
              />
            </div>
          ))}
        </Section>
      )}

      {subsidiaries.length > 0 && (
        <Section title="Subsidiaries">
          {subsidiaries.map((s, i) => (
            <div key={i} className="rel-item">
              <span className="rel-item__name">{s.entity.name}</span>
              <OwnershipBadge type={s.relationship?.ownership_type} percent={s.relationship?.stake_percent} />
            </div>
          ))}
        </Section>
      )}

      {executives.length > 0 && (
        <Section title="Executives">
          {executives.map((e, i) => (
            <div key={i} className="rel-item">
              <span className="rel-item__name">{e.person.full_name}</span>
              <span className="role-badge">{e.role?.role}</span>
            </div>
          ))}
        </Section>
      )}

      <div className="panel-actions">
        {!isCenter && (
          <button
            className="expand-btn"
            disabled={expandingId === entity.id}
            onClick={() => onExpand(entity.id)}
          >
            {expandingId === entity.id
              ? <FiLoader className="spin" />
              : <FiPlusCircle />}
            {' '}Expand graph
          </button>
        )}
        {!isCenter && onNavigateTo && (
          <button
            className="expand-btn"
            onClick={() => onNavigateTo({ id: entity.id, label: entity.name, nodeType: 'entity', entitySubtype: entity.type, raw: profile.entity })}
          >
            <FiNavigation /> Open as center
          </button>
        )}
      </div>
    </div>
  )
}

function PanelTabs({ active, onChange }: { active: string; onChange: (tab: string) => void }) {
  return (
    <div className="panel-tabs">
      <button
        className={`panel-tab ${active === 'overview' ? 'panel-tab--active' : ''}`}
        onClick={() => onChange('overview')}
      >
        <FiList /> Overview
      </button>
      <button
        className={`panel-tab ${active === 'timeline' ? 'panel-tab--active' : ''}`}
        onClick={() => onChange('timeline')}
      >
        <FiClock /> Timeline
      </button>
    </div>
  )
}

export default function NodePanel({ node, onExpand, expandingId, onNavigateTo, centerId }: NodePanelProps) {
  const [profile,     setProfile]     = useState<FullProfile | null>(null)
  const [loading,     setLoading]     = useState<boolean>(false)
  const [activeView,  setActiveView]  = useState<string>('overview')

  useEffect(() => {
    if (!node || node.nodeType !== 'entity') {
      setProfile(null)
      return
    }
    setActiveView('overview')
    setLoading(true)
    setProfile(null)
    getFullProfile(node.id)
      .then(({ data }) => setProfile(data))
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }, [node?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) {
    return (
      <div className="panel-empty">
        <div className="panel-empty-icon">◈</div>
        <p>Click any node in the graph<br />to see its details here</p>
      </div>
    )
  }

  if (node.nodeType === 'person') return <PersonView raw={node.raw as Person} onNavigateTo={onNavigateTo} isCenter={node.id === centerId} />

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
        ? <EntityOverview profile={profile} onExpand={onExpand} expandingId={expandingId} onNavigateTo={onNavigateTo} isCenter={node.id === centerId} />
        : <TimelinePanel entityId={profile.entity.id} />}
    </>
  )
}
