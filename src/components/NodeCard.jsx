export default function NodeCard({ node, onExpand, onClose }) {
  const isEntity = node.nodeType === 'entity'
  const raw = node.raw || {}

  const fmt = (n) =>
    n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${n}`

  return (
    <div className="node-card">
      <button className="node-card-close" onClick={onClose} aria-label="Close">✕</button>

      <span className={`node-badge ${node.nodeType}`}>
        {isEntity ? raw.type || 'entity' : 'person'}
      </span>

      <h2 className="node-card-title">{node.label}</h2>

      {raw.description && <p className="node-card-desc">{raw.description}</p>}

      <div className="node-card-meta">
        {raw.country && (
          <div className="meta-row">
            <span>Country</span><strong>{raw.country}</strong>
          </div>
        )}
        {raw.founded && (
          <div className="meta-row">
            <span>Founded</span><strong>{raw.founded}</strong>
          </div>
        )}
        {raw.revenue != null && (
          <div className="meta-row">
            <span>Revenue</span><strong>{fmt(raw.revenue)}</strong>
          </div>
        )}
        {raw.nationality && (
          <div className="meta-row">
            <span>Nationality</span><strong>{raw.nationality}</strong>
          </div>
        )}
        {raw.wikipedia_url && (
          <div className="meta-row">
            <span>Wikipedia</span>
            <a href={raw.wikipedia_url} target="_blank" rel="noreferrer">↗ link</a>
          </div>
        )}
      </div>

      {isEntity && (
        <button className="node-card-expand" onClick={() => onExpand(raw.id)}>
          Expand ownership
        </button>
      )}
    </div>
  )
}
