import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FiMapPin, FiCalendar, FiDollarSign, FiExternalLink, FiList, FiClock, FiDownload } from 'react-icons/fi'
import { getFullProfile } from '../services/api'
import OwnershipBadge from './OwnershipBadge'
import TimelinePanel  from './TimelinePanel'
import type { NodeData, FullProfile, Person } from '../types'

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
  onExportPng?: () => void
  onExportCsv?: () => void
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
  const { t } = useTranslation()
  const imgSrc = usePersonImage(raw.full_name, raw.wikipedia_url)
  return (
    <div className="panel-body">
      {imgSrc && (
        <img className="panel-avatar" src={imgSrc} alt={raw.full_name} />
      )}
      <span className="node-type-badge node-type-badge--person">{t('legend.person')}</span>
      <h2 className="panel-name">{raw.full_name}</h2>
      {raw.description && <p className="panel-desc">{raw.description}</p>}
      <div className="panel-meta">
        <MetaRow icon={FiMapPin} label={t('panel.nationality')} value={raw.nationality} />
      </div>
      {raw.wikipedia_url && (
        <a className="panel-link" href={raw.wikipedia_url} target="_blank" rel="noreferrer">
          <FiExternalLink /> {t('panel.wikipedia')}
        </a>
      )}
    </div>
  )
}

interface EntityOverviewProps {
  profile: FullProfile
  onExportPng?: () => void
  onExportCsv?: () => void
}

function EntityOverview({ profile, onExportPng, onExportCsv }: EntityOverviewProps) {
  const { t } = useTranslation()
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
        {t(`legend.${entity.type || 'company'}`, { defaultValue: entity.type || 'company' })}
      </span>
      <h2 className="panel-name">{entity.name}</h2>
      {entity.description && <p className="panel-desc">{entity.description}</p>}

      <div className="panel-meta">
        <MetaRow icon={FiMapPin}     label={t('panel.country')}  value={entity.country} />
        <MetaRow icon={FiCalendar}   label={t('panel.founded')}  value={entity.founded} />
        <MetaRow icon={FiDollarSign} label={t('panel.revenue')}  value={entity.revenue != null ? fmt(entity.revenue) : null} />
        {headquarters && (
          <MetaRow icon={FiMapPin} label={t('panel.hq')} value={`${headquarters.city}, ${headquarters.country}`} />
        )}
      </div>

      {owners.length > 0 && (
        <Section title={t('panel.ownedBy')}>
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
        <Section title={t('panel.subsidiaries')}>
          {subsidiaries.map((s, i) => (
            <div key={i} className="rel-item">
              <span className="rel-item__name">{s.entity.name}</span>
              <OwnershipBadge type={s.relationship?.ownership_type} percent={s.relationship?.stake_percent} />
            </div>
          ))}
        </Section>
      )}

      {executives.length > 0 && (
        <Section title={t('panel.executives')}>
          {executives.map((e, i) => (
            <div key={i} className="rel-item">
              <span className="rel-item__name">{e.person.full_name}</span>
              <span className="role-badge">{e.role?.role}</span>
            </div>
          ))}
        </Section>
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

export default function NodePanel({ node, onExportPng, onExportCsv }: NodePanelProps) {
  const { t } = useTranslation()
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
        <p>{t('panel.empty').split('\n').map((line, i) => <span key={i}>{line}{i === 0 && <br />}</span>)}</p>
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
        ? <EntityOverview profile={profile} onExportPng={onExportPng} onExportCsv={onExportCsv} />
        : <TimelinePanel entityId={profile.entity.id} />}
    </>
  )
}
