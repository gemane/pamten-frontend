const TYPE_COLORS = {
  full:       '#2ECC71',
  majority:   '#2ECC71',
  minority:   '#F39C12',
  controlling:'#E74C3C',
}

export default function OwnershipBadge({ type, percent }) {
  const color = TYPE_COLORS[type] || '#8892a4'
  return (
    <span
      className="ownership-badge"
      style={{ borderColor: color, color }}
    >
      {type || 'owned'}
      {percent != null ? ` · ${percent}%` : ''}
    </span>
  )
}
