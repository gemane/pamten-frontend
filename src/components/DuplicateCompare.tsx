import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiAlertCircle, FiExternalLink, FiLoader } from 'react-icons/fi'
import { getPersonProfile } from '../services/api'
import { countryName } from '../utils/isoCountries'
import { formatDate } from '../utils/dates'
import { buildHash } from '../utils/viewHash'
import type { PersonProfile } from '../types'

/** The members of one duplicate group side by side, so the reviewer can tell
 *  one person under two spellings from two people of one name: what each
 *  record says about the person, and the companies each is tied to — a
 *  company more than one of them names is marked, since a shared company is
 *  the strongest sign the records are the same person.
 *
 *  Each record's profile is read when the comparison is opened, not with the
 *  list: the review list holds hundreds of groups. */

interface Member { id: string; full_name: string }

type Loaded = Record<string, PersonProfile | 'error'>

/** One company line of a record: the seat or the holding, with its years. */
export interface CompanyLine { entityId: string; name: string; what: string; years: string }

function year(value?: string | null): string {
  return value ? String(value).slice(0, 4) : ''
}

/** "2014–2019", "2014–", "–2019", "" — the years a seat was held. */
export function yearSpan(since?: string | null, until?: string | null): string {
  const a = year(since), b = year(until)
  return a || b ? `${a}–${b}` : ''
}

export function companyLines(profile: PersonProfile, holdingLabel: string): CompanyLine[] {
  const seats = (profile.positions ?? []).map(p => ({
    entityId: p.entity.id, name: p.entity.name, what: p.role?.role ?? '',
    years: yearSpan(p.role?.since, p.role?.until),
  }))
  const holdings = (profile.holdings ?? []).map(h => ({
    entityId: h.entity.id, name: h.entity.name, what: holdingLabel,
    years: yearSpan(h.relationship?.since, h.relationship?.until),
  }))
  return [...seats, ...holdings]
}

/** The companies more than one of the records is tied to. */
export function sharedCompanies(lines: CompanyLine[][]): Set<string> {
  const seen = new Map<string, number>()
  for (const record of lines)
    for (const id of new Set(record.map(l => l.entityId))) seen.set(id, (seen.get(id) ?? 0) + 1)
  return new Set([...seen].filter(([, n]) => n > 1).map(([id]) => id))
}

export default function DuplicateCompare({ members }: { members: Member[] }) {
  const { t, i18n } = useTranslation()
  const [loaded, setLoaded] = useState<Loaded>({})
  const ids = members.map(m => m.id).join('|')

  useEffect(() => {
    let live = true
    setLoaded({})
    for (const m of members) {
      getPersonProfile(m.id)
        .then(r => { if (live) setLoaded(prev => ({ ...prev, [m.id]: r.data })) })
        .catch(() => { if (live) setLoaded(prev => ({ ...prev, [m.id]: 'error' })) })
    }
    return () => { live = false }
    // keyed by the ids: the members array itself is new on every render
  }, [ids])

  const profiles = members.map(m => loaded[m.id])
  const lines = profiles.map(p => (p && p !== 'error' ? companyLines(p, t('duplicates.compare.holding')) : []))
  const shared = sharedCompanies(lines)
  const date = (v?: string | null) => formatDate(v, i18n.language) ?? '—'

  const field = (label: string, value: (p: PersonProfile) => string) => (
    <tr>
      <th scope="row">{label}</th>
      {profiles.map((p, i) => (
        <td key={members[i].id}>{p && p !== 'error' ? value(p) || '—' : ''}</td>
      ))}
    </tr>
  )

  return (
    <div className="dup-compare">
      <table className="dup-compare__table">
        <thead>
          <tr>
            <th />
            {members.map((m, i) => (
              <th key={m.id} scope="col">
                <span className="dup-compare__name">{m.full_name}</span>
                <a className="dup-compare__open" target="_blank" rel="noreferrer"
                   href={buildHash({ tab: 'graph', entityId: m.id, entityType: 'person' })}
                   title={t('duplicates.compare.open')}>
                  <FiExternalLink />
                </a>
                {!profiles[i] && <FiLoader className="spin" aria-label={t('duplicates.loading')} />}
                {profiles[i] === 'error' && (
                  <span className="dup-compare__error"><FiAlertCircle /> {t('duplicates.compare.loadError')}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {field(t('duplicates.compare.born'), p => [date(p.person.birth_date), p.person.birth_place].filter(v => v && v !== '—').join(', '))}
          {field(t('duplicates.compare.died'), p => (p.person.death_date ? date(p.person.death_date) : ''))}
          {field(t('duplicates.compare.nationality'),
            p => (p.person.nationalities ?? []).map(c => countryName(c, i18n.language)).join(', '))}
          {field(t('duplicates.compare.description'), p => p.person.description ?? '')}
          {field(t('duplicates.compare.merged'), p => (p.identity?.merged.count ? String(p.identity.merged.count) : ''))}
          <tr>
            <th scope="row">{t('duplicates.compare.companies')}</th>
            {profiles.map((p, i) => (
              <td key={members[i].id}>
                {p && p !== 'error' && lines[i].length === 0 && '—'}
                <ul className="dup-compare__companies">
                  {lines[i].map((l, n) => (
                    <li key={`${l.entityId}-${n}`}
                        className={shared.has(l.entityId) ? 'dup-compare__company--shared' : undefined}
                        title={shared.has(l.entityId) ? t('duplicates.compare.shared') : undefined}>
                      <span className="dup-compare__company">{l.name}</span>
                      <span className="dup-compare__what">{[l.what, l.years].filter(Boolean).join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
