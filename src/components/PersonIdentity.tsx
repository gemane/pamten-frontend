/**
 * Who this is, as far as the records say.
 *
 * A person in the graph is often several register entries folded into one: the
 * UK register writes an owner once per company, the SEC and Wikidata write the
 * same human under their own keys. Two things were invisible until now:
 *
 *  - which entries were folded in, and on what evidence — a shared filer number
 *    is proof, a shared birth month under an uncommon name is a good guess;
 *  - that OTHER entries carry the same name and birth month and were left
 *    apart. Under a common name that is the honest state: the register gives
 *    no key for a person, and a "David Smith" born in March 1961 has namesakes.
 *
 * The section says both in the reader's words and shows the weakest link first,
 * because a person is only as surely one person as its least certain merge.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiChevronDown, FiChevronRight } from 'react-icons/fi'
import { formatDate } from '../utils/dates'
import type { MergeTier, PersonIdentity, PersonNamesake } from '../types'

/** Weakest first — the order the backend ranks them in. */
export const TIERS: MergeTier[] = ['likely', 'strong', 'confirmed', 'proof']

/** Every basis the backend can state (`merge_quality.BASES`); anything else is
 *  worded as a plain name match rather than shown as a raw code. */
export const BASES = [
  'manual', 'register_number', 'birth_date', 'birth_month_rare_name', 'name_and_company', 'name',
  'birth_month_and_company', 'birth_month_and_co_owner', 'birth_month_and_ownership',
  'birth_month_and_office', 'birth_month_and_verification', 'birth_month_and_postcode',
] as const

export const basisKey = (basis: string) =>
  `identity.basis.${(BASES as readonly string[]).includes(basis) ? basis : 'name'}`

/** Whether there is anything to say: a merge, or somebody else of the name. */
export function hasIdentity(identity: PersonIdentity | null | undefined): identity is PersonIdentity {
  return !!identity && (identity.merged.count > 0 || (identity.namesakes?.count ?? 0) > 0)
}

export default function PersonIdentitySection({ identity, onOpenPerson }: {
  identity: PersonIdentity | null | undefined
  onOpenPerson?: (entry: PersonNamesake) => void
}) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!hasIdentity(identity)) return null
  const { merged, namesakes } = identity
  const others = namesakes?.count ?? 0
  return (
    <div className="panel-section identity">
      <button type="button" className="panel-section__toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        {open ? <FiChevronDown size={12} /> : <FiChevronRight size={12} />}
        <span className="panel-section__title panel-section__title--inline">{t('identity.title')}</span>
      </button>

      {/* Always visible: how many records, and how sure the least sure merge is. */}
      {merged.count > 0 && (
        <p className="identity__summary">
          {t('identity.merged', { count: merged.count })}
          {merged.tier && (
            <span className={`identity__tier identity__tier--${merged.tier}`} title={t(`identity.tierHint.${merged.tier}`)}>
              {t(`identity.tier.${merged.tier}`)}
            </span>
          )}
        </p>
      )}
      {others > 0 && (
        <p className="identity__summary">{t('identity.namesakes', { count: others })}</p>
      )}

      {open && (<>
        {merged.entries.length > 0 && (
          <ul className="identity__list" aria-label={t('identity.mergedList')}>
            {merged.entries.map((e, i) => (
              <li key={i} className="identity__row">
                <span className="identity__name">{e.name ?? t('identity.unnamed')}</span>
                <span className="identity__basis">{t(basisKey(e.basis))}</span>
                <span className={`identity__tier identity__tier--${e.tier}`} title={t(`identity.tierHint.${e.tier}`)}>
                  {t(`identity.tier.${e.tier}`)}
                </span>
                {e.at && <span className="rel-item__year">{formatDate(e.at.slice(0, 10), i18n.language)}</span>}
              </li>
            ))}
          </ul>
        )}
        {namesakes && others > 0 && (<>
          <p className="identity__note">{t('identity.namesakesNote')}</p>
          <ul className="identity__list" aria-label={t('identity.namesakesList')}>
            {namesakes.entries.map(n => (
              <li key={n.id} className="identity__row">
                {onOpenPerson
                  ? <button type="button" className="identity__link" onClick={() => onOpenPerson(n)}>{n.full_name}</button>
                  : <span className="identity__name">{n.full_name}</span>}
                {n.companies.length > 0 && <span className="identity__basis">{n.companies.join(', ')}</span>}
              </li>
            ))}
          </ul>
          {others > namesakes.entries.length && (
            <p className="identity__note">{t('identity.more', { count: others - namesakes.entries.length })}</p>
          )}
        </>)}
      </>)}
    </div>
  )
}
