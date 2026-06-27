import { useState, useEffect } from 'react'
import { FiMapPin, FiCalendar, FiDollarSign, FiExternalLink, FiZoomIn, FiList, FiClock, FiLoader } from 'react-icons/fi'
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

function useWikipediaImage(wikipediaUrl: string | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    if (!wikipediaUrl) { setSrc(null); return }
    setSrc(null)
    const match = wikipediaUrl.match(/\/wiki\/([^#?]+)/)
    if (!match) return
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${match[1]}`)
      .then(r => r.json())
      .then(data => { if (data?.thumbnail?.source) setSrc(data.thumbnail.source) })
      .catch(() => {})
  }, [wikipediaUrl])
  return src
}

interface NodePanelProps {
  node: NodeData | null
  onExpand: (id: string) => void
  expandingId: string | null
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

function PersonView({ raw }: { raw: Person }) {
  const imgSrc = useWikipediaImage(raw.wikipedia_url)
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
    </div>
  )
}

interface EntityOverviewProps {
  profile: FullProfile
  onExpand: (id: string) => void
  expandingId: string | null
}

function EntityOverview({ profile, onExpand, expandingId }: EntityOverviewProps) {
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
              <OwnershipBadge type={o.relationship?.ownership_type} percent={o.relationship?.stake_percent} />
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

      <button
        className="expand-btn"
        onClick={() => onExpand(entity.id)}
        disabled={!!expandingId}
      >
        {expandingId === entity.id
          ? <><FiLoader className="spin" /> Expanding…</>
          : <><FiZoomIn /> Expand into graph</>}
      </button>
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

export default function NodePanel({ node, onExpand, expandingId }: NodePanelProps) {
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

  if (node.nodeType === 'person') return <PersonView raw={node.raw as Person} />

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
        ? <EntityOverview profile={profile} onExpand={onExpand} expandingId={expandingId} />
        : <TimelinePanel entityId={profile.entity.id} />}
    </>
  )
}
