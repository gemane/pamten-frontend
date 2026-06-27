import type { OwnershipType } from '../types'

interface OwnershipBadgeProps {
  type?: OwnershipType | string | null
  percent?: number | null
  votingPct?: number | null
}

const TYPE_COLORS: Record<string, string> = {
  full:       '#2ECC71',
  majority:   '#2ECC71',
  minority:   '#F39C12',
  controlling:'#E74C3C',
}

export default function OwnershipBadge({ type, percent, votingPct }: OwnershipBadgeProps) {
  const resolved = (type && type !== 'unknown') ? type : null
  const color = TYPE_COLORS[resolved ?? ''] || '#8892a4'
  return (
    <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
      <span
        className="ownership-badge"
        style={{ borderColor: color, color }}
      >
        {resolved || 'owned'}
        {percent != null ? ` · ${percent}%` : ''}
      </span>
      {votingPct != null && (
        <span className="voting-badge">⚡ {votingPct}%</span>
      )}
    </span>
  )
}
