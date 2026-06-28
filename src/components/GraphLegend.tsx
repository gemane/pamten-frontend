import { useState } from 'react'
import { FiInfo } from 'react-icons/fi'

export default function GraphLegend() {
  const [open, setOpen] = useState(false)
  return (
    <div className="graph-legend">
      <button className="graph-legend__toggle" onClick={() => setOpen(v => !v)} title="Legend">
        <FiInfo />
      </button>
      {open && (
        <div className="graph-legend__panel">
          <div className="graph-legend__section">Nodes</div>
          <div className="graph-legend__row"><span className="graph-legend__node" style={{ background: '#4A90D9', borderColor: '#2d6aa8' }} />Company</div>
          <div className="graph-legend__row"><span className="graph-legend__node" style={{ background: '#E67E22', borderColor: '#b05a0d' }} />Brand</div>
          <div className="graph-legend__row"><span className="graph-legend__node" style={{ background: '#8E44AD', borderColor: '#622d7a' }} />Holding</div>
          <div className="graph-legend__row"><span className="graph-legend__node" style={{ background: '#27AE60', borderColor: '#1a7a42', borderRadius: '50%' }} />Person</div>

          <div className="graph-legend__section" style={{ marginTop: 10 }}>Ownership (economic stake)</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: '#2ECC71' }} />Full / Majority</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: '#F39C12' }} />Minority</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: '#E74C3C' }} />Controlling</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: 'none', borderTop: '2px dashed #9B59B6' }} />Voting power</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ background: 'none', borderTop: '2px dashed #6c7ae0' }} />Role</div>

          <div className="graph-legend__section" style={{ marginTop: 10 }}>Edge width</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ height: 2, background: '#8892a4' }} />Low %</div>
          <div className="graph-legend__row"><span className="graph-legend__edge" style={{ height: 5, background: '#8892a4' }} />High %</div>
        </div>
      )}
    </div>
  )
}
