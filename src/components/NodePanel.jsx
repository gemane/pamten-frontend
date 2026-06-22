import { useState, useEffect } from 'react'
import { FiMapPin, FiCalendar, FiDollarSign, FiExternalLink, FiZoomIn, FiList, FiClock } from 'react-icons/fi'
import { getFullProfile } from '../services/api'
import OwnershipBadge from './OwnershipBadge'
import TimelinePanel  from './TimelinePanel'

function MetaRow({ icon: Icon, label, value }) {
  if (!value) return null
  return (
    <div className="meta-row">
      <Icon className="meta-icon" />
      <span className="meta-label">{label}</span>
      <span className="meta-value">{value}</span>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="panel-section">
      <h4 className="panel-section__title">{title}</h4>
      {children}
    </div>
  )
}

function PersonView({ raw }) {
  return (
    <div className="panel-body">
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

function EntityOverview({ profile, onExpand }) {
  const { entity, headquarters, owners = [], subsidiaries = [], executives = [] } = profile

  const fmt = (n) =>
    n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${n}`

  return (
    <div className="panel-body">
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
              <span className="rel-item__name">{o.owner?.name || o.owner?.full_name || '—'}</span>
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

      <button className="expand-btn" onClick={() => onExpand(entity.id)}>
        <FiZoomIn /> Expand into graph
      </button>
    </div>
  )
}

function PanelTabs({ active, onChange }) {
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

export default function NodePanel({ node, onExpand }) {
  const [profile,     setProfile]     = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [activeView,  setActiveView]  = useState('overview')

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

  if (node.nodeType === 'person') return <PersonView raw={node.raw || {}} />

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
        ? <EntityOverview profile={profile} onExpand={onExpand} />
        : <TimelinePanel entityId={profile.entity.id} />}
    </>
  )
}
