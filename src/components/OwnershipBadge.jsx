const TYPE_COLORS = {
  full:       '#2ECC71',
  majority:   '#2ECC71',
  minority:   '#F39C12',
  controlling:'#E74C3C',
}

export default function OwnershipBadge({ type, percent }) {
  const resolved = (type && type !== 'unknown') ? type : null
  const color = TYPE_COLORS[resolved] || '#8892a4'
  return (
    <span
      className="ownership-badge"
      style={{ borderColor: color, color }}
    >
      {resolved || 'owned'}
      {percent != null ? ` · ${percent}%` : ''}
    </span>
  )
}
