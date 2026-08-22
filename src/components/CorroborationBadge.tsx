import { useTranslation } from 'react-i18next'
import type { OwnsRelationship, RoleRelationship } from '../types'

/**
 * How much company a fact has — the trust cue on a relationship row.
 *
 * The graph mixes statutory filings with community data, and until now a row
 * gave no hint which it was reading: a 13G-backed stake and a lone Wikidata
 * statement rendered identically. The claims table has recorded who asserts
 * each relationship all along; the backend now sends the names, and this badge
 * is the visible end of that.
 *
 * Three states, two of them worth a mark:
 *
 * - **Corroborated** (≥2 sources): a check and the count. Independent
 *   confirmation is the strongest signal the graph has, and rare — 1.5% of
 *   claimed relationships on dev when this shipped — which is exactly why it
 *   deserves the mark.
 * - **Community-only** (every asserting source is community-tier): a hollow
 *   marker. Not a warning — Wikidata earns its place — but a reader comparing
 *   two rows should be able to see that one rests on a register and the other
 *   on a wiki.
 * - **Register-backed single source**: nothing. It is the normal case, and
 *   badging the normal case turns every row into noise.
 *
 * Absence of claim data (`corroborations` 0 or missing — edges older than the
 * claims table) also shows nothing: we do not know, and a hollow marker would
 * wrongly read as "community".
 */

/** Sources whose word is community consensus rather than a filing or register.
 *  A name list rather than a tier field because the profile payload carries
 *  names; extend it if another community source is ever added. */
const COMMUNITY_SOURCES = new Set(['Wikidata'])

export function trustLevel(rel?: OwnsRelationship | RoleRelationship | null):
    'corroborated' | 'community' | null {
  const sources = rel?.asserted_by ?? []
  const n = rel?.corroborations ?? 0
  if (n >= 2) return 'corroborated'
  if (n === 1 && sources.every(s => COMMUNITY_SOURCES.has(s))) return 'community'
  return null
}

export default function CorroborationBadge({ rel }: {
  rel?: OwnsRelationship | RoleRelationship | null
}) {
  const { t } = useTranslation()
  const level = trustLevel(rel)
  if (!level) return null

  if (level === 'corroborated') {
    return (
      <span className="corroboration-badge corroboration-badge--confirmed"
            title={t('trust.corroboratedHint', { sources: (rel?.asserted_by ?? []).join(', ') })}>
        ✓ {rel?.corroborations}
      </span>
    )
  }
  return (
    <span className="corroboration-badge corroboration-badge--community"
          title={t('trust.communityHint')}>
      {t('trust.community')}
    </span>
  )
}
