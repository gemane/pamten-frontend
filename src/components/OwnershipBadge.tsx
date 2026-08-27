import { useTranslation } from 'react-i18next'
import type { OwnershipType } from '../types'

interface OwnershipBadgeProps {
  type?: OwnershipType | string | null
  percent?: number | null
  votingPct?: number | null
}

const TYPE_COLORS: Record<string, string> = {
  full:        '#2ECC71',
  majority:    '#2ECC71',
  minority:    '#F39C12',
  controlling: '#E74C3C',
}

// Voting control disproportionate to the economic stake. Three causes, all
// real: a golden share, a super-voting share class, or — the AB InBev case —
// a voting agreement under which the holder votes a bloc far larger than its
// own shareholding (Altria: 8% owned, 51.7% voted).
export function isSpecialVoting(percent?: number | null, votingPct?: number | null): boolean {
  if (votingPct == null) return false
  return (percent == null && votingPct >= 25) || (percent != null && votingPct - percent >= 25)
}

export default function OwnershipBadge({ type, percent, votingPct }: OwnershipBadgeProps) {
  const { t } = useTranslation()
  const resolved = (type && type !== 'unknown') ? type : null
  const color    = TYPE_COLORS[resolved ?? ''] || '#8892a4'
  const label    = resolved
    ? (t(`ownershipType.${resolved}`, { defaultValue: '' }) || resolved)
    : t('ownershipType.owned')
  return (
    <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
      <span className="ownership-badge" style={{ borderColor: color, color }}>
        {label}{percent != null ? ` · ${percent}%` : ''}
      </span>
      {/* A marker, not a reading. The row's job is to make an owner who votes
          far more than it owns noticeable while scanning; the figures and the
          reason are one press away, in the relationship's own menu, which
          already lists Stake and Voting. Two badges here said the same thing
          the menu says, at the cost of a crowded row. */}
      {isSpecialVoting(percent, votingPct) && (
        <span className="voting-badge voting-badge--marker"
              title={t('ownershipType.specialVotingHint')}
              aria-label={t('ownershipType.specialVoting')}>⚡</span>
      )}
    </span>
  )
}
