import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiInfo } from 'react-icons/fi'

export default function GraphLegend() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <div className="graph-legend">
      <button className="graph-legend__toggle" onClick={() => setOpen(v => !v)} title="Legend">
        <FiInfo />
      </button>
      {open && (
        <div className="graph-legend__panel">
          <div className="graph-legend__section">{t('legend.nodes')}</div>
          <div className="graph-legend__row"><span className="graph-legend__node" style={{ background: '#4A90D9', borderColor: '#2d6aa8' }} />{t('legend.company')}</div>
          <div className="graph-legend__row"><span className="graph-legend__node" style={{ background: '#E67E22', borderColor: '#b05a0d' }} />{t('legend.brand')}</div>
          <div className="graph-legend__row"><span className="graph-legend__node" style={{ background: '#8E44AD', borderColor: '#622d7a' }} />{t('legend.holding')}</div>
          <div className="graph-legend__row"><span className="graph-legend__node" style={{ background: '#27AE60', borderColor: '#1a7a42', borderRadius: '50%' }} />{t('legend.person')}</div>

          <div className="graph-legend__section" style={{ marginTop: 10 }}>{t('legend.ownership')}</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: '#2ECC71' }} />{t('legend.fullMajority')}</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: '#F39C12' }} />{t('legend.minority')}</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: '#E74C3C' }} />{t('legend.controlling')}</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: 'none', borderTop: '2px dashed #9B59B6' }} />{t('legend.votingPower')}</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: 'none', borderTop: '2px dashed #6c7ae0' }} />{t('legend.role')}</div>

          <div className="graph-legend__section" style={{ marginTop: 10 }}>{t('legend.edgeWidth')}</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ height: 2, background: '#8892a4' }} />{t('legend.lowPct')}</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ height: 5, background: '#8892a4' }} />{t('legend.highPct')}</div>
        </div>
      )}
    </div>
  )
}
