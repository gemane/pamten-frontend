import { countryName } from './isoCountries'
import type { GraphElement } from '../types'

const escape = (v: unknown) => {
  const s = String(v ?? '')
  // Prefix formula-trigger characters so spreadsheets don't evaluate them
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}
const cap    = (s: string)  => s.charAt(0).toUpperCase() + s.slice(1)

export function buildCsvContent(
  elements: GraphElement[],
  t: (key: string, opts?: Record<string, unknown>) => string,
  locale?: string,
): string {
  const nameOf = new Map<string, string>()
  for (const el of elements) {
    const d = el.data
    if (!('source' in d) && d.id && d.label) nameOf.set(d.id, d.label)
  }

  const edgeTypeLabel: Record<string, string> = {
    owns:  t('csv.relOwnership'),
    votes: t('csv.relVoting'),
    role:  t('csv.relRole'),
  }

  const nodeRows = [[t('csv.name'), t('csv.type'), t('csv.subtype'), t('csv.country'), t('csv.founded'), t('csv.revenue')].join(',')]
  const edgeRows = [[t('csv.from'), t('csv.to'), t('csv.relationship'), t('csv.ownershipType'), t('csv.stakePct'), t('csv.votingPct')].join(',')]

  for (const el of elements) {
    const d = el.data
    if ('source' in d) {
      const from  = nameOf.get(d.source) ?? d.source
      const to    = nameOf.get(d.target) ?? d.target
      const rel   = edgeTypeLabel[d.edgeType] ?? cap(String(d.edgeType ?? ''))
      const otype = d.ownershipType
        ? (t(`ownershipType.${d.ownershipType}`, { defaultValue: '' }) || cap(String(d.ownershipType)))
        : ''
      const stake = d.stakePct    != null ? `${d.stakePct}%`        : ''
      const vote  = d.votingPowerPct != null ? `${d.votingPowerPct}%` : ''
      edgeRows.push([from, to, rel, otype, stake, vote].map(escape).join(','))
    } else {
      const raw     = (d.raw ?? {}) as unknown as Record<string, unknown>
      const type    = d.nodeType === 'person'
        ? t('legend.person')
        : (t(`legend.${d.entitySubtype ?? d.nodeType ?? ''}`, { defaultValue: '' }) || cap(String(d.entitySubtype ?? d.nodeType ?? '')))
      const revenue = raw.revenue != null
        ? `$${((raw.revenue as number) / 1e9).toFixed(1)}B`
        : ''
      nodeRows.push([d.label, type, '', raw.country ? countryName(String(raw.country), locale) : '', raw.founded ?? '', revenue].map(escape).join(','))
    }
  }

  return [nodeRows.join('\n'), '\n\n', edgeRows.join('\n')].join('')
}
