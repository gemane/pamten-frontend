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

// Voting control disproportionate to the economic stake — a golden share /
// super-voting class (e.g. 0.01% owned but 51% of the votes).
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
      {votingPct != null && (
        <span className="voting-badge">⚡ {votingPct}%</span>
      )}
      {isSpecialVoting(percent, votingPct) && (
        <span className="special-voting-badge" title={t('ownershipType.specialVotingHint')}>
          ◆ {t('ownershipType.specialVoting')}
        </span>
      )}
    </span>
  )
}
