import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FiInfo } from 'react-icons/fi'
import { ENTITY_COLORS, ENTITY_SUBTYPES } from '../utils/entityColors'

export default function GraphLegend() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e instanceof TouchEvent ? e.touches[0]?.target : (e as MouseEvent).target
      if (ref.current && !ref.current.contains(target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])

  return (
    <div className="graph-legend" ref={ref}>
      <button className="graph-legend__toggle" onClick={() => setOpen(v => !v)} title="Legend">
        <FiInfo />
      </button>
      {open && (
        <div className="graph-legend__panel">
          <div className="graph-legend__section">{t('legend.nodes')}</div>
          {/* Driven from the shared palette so the key cannot describe colours
              the graph no longer draws. Person last, matching the graph's rule
              order, and round like its node. */}
          {[...['company'], ...ENTITY_SUBTYPES, 'person'].map(type => (
            <div className="graph-legend__row" key={type}>
              <span
                className="graph-legend__node"
                style={{
                  background: ENTITY_COLORS[type].fill,
                  borderColor: ENTITY_COLORS[type].border,
                  ...(type === 'person' ? { borderRadius: '50%' } : {}),
                  // Mirrors the diamond the graph draws for a voting group.
                  ...(type === 'voting_group' ? { transform: 'rotate(45deg)' } : {}),
                }}
              />
              {t(`legend.${type}`)}
            </div>
          ))}

          <div className="graph-legend__section" style={{ marginTop: 10 }}>{t('legend.ownership')}</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: '#2ECC71' }} />{t('legend.fullMajority')}</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: '#F39C12' }} />{t('legend.minority')}</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: '#E74C3C' }} />{t('legend.controlling')}</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: 'none', borderTop: '2px dashed #9B59B6' }} />{t('legend.votingPower')}</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: 'none', borderTop: '2px dashed #8892a4' }} />{t('legend.ultimateParent')}</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: 'none', borderTop: '2px dashed #6c7ae0' }} />{t('legend.role')}</div>

          <div className="graph-legend__section" style={{ marginTop: 10 }}>{t('legend.edgeWidth')}</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ height: 2, background: '#8892a4' }} />{t('legend.lowPct')}</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ height: 5, background: '#8892a4' }} />{t('legend.highPct')}</div>
        </div>
      )}
    </div>
  )
}
