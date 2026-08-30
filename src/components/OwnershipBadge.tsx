import { useTranslation } from 'react-i18next'
import type { OwnershipType } from '../types'

interface OwnershipBadgeProps {
  type?: OwnershipType | string | null
  percent?: number | null
  votingPct?: number | null
  /** Share count, shown compactly when no percentage can be stated — a 13F
   *  position in a company with no known shares outstanding, or a real holding
   *  below the rounding floor. "Minority" alone reads as missing data when the
   *  edge in fact knows exactly how many shares are held. */
  shares?: number | null
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

// Below this, a percentage stops informing: "0.0001%" says less than the
// share count behind it. User's rule — the shares presentation starts under
// 0.001%. A tiny percent with NO share count still shows the percent, because
// a number beats nothing.
export const PCT_DISPLAY_FLOOR = 0.001

export default function OwnershipBadge({ type, percent, votingPct, shares }: OwnershipBadgeProps) {
  const { t, i18n } = useTranslation()
  const pctShown = percent != null && (percent >= PCT_DISPLAY_FLOOR || shares == null)
  // 3,365,400 → "3.4M" — a badge is a glance, the exact figure is one press
  // away in the row's own menu. Locale-aware (German says "Mio.").
  const compactShares = !pctShown && shares != null
    ? new Intl.NumberFormat(i18n.language, { notation: 'compact',
                                             maximumFractionDigits: 1 }).format(shares)
    : null
  const resolved = (type && type !== 'unknown') ? type : null
  const color    = TYPE_COLORS[resolved ?? ''] || '#8892a4'
  const label    = resolved
    ? (t(`ownershipType.${resolved}`, { defaultValue: '' }) || resolved)
    : t('ownershipType.owned')
  return (
    <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
      {/* Before the stake, not after. It qualifies the number that follows —
          "8.1%, but it votes far more than that" — and reading the figure first
          and the caveat second gets the emphasis backwards. A marker, not a
          reading: the figures and the reason are one press away in the
          relationship's own menu, which already lists Stake and Voting. */}
      {isSpecialVoting(percent, votingPct) && (
        <span className="voting-badge voting-badge--marker"
              title={t('ownershipType.specialVotingHint')}
              aria-label={t('ownershipType.specialVoting')}>⚡</span>
      )}
      <span className="ownership-badge" style={{ borderColor: color, color }}>
        {label}
        {pctShown ? ` · ${percent}%`
          : compactShares != null ? ` · ${t('ownershipType.sharesCompact', { n: compactShares })}` : ''}
      </span>
    </span>
  )
}
