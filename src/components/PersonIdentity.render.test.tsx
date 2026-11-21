/**
 * "How this record was put together" on a person's panel.
 *
 * The backend says which records were folded into a person and how sure each
 * merge is, and who else carries the name and birth month (backend findings
 * item 124). The cases are the shapes the register produces: an owner written
 * once per company and merged on an uncommon name, an editor's merge, a "David
 * Smith" with namesakes the dedupe rightly left apart.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'
import PersonIdentitySection, { BASES, TIERS, basisKey, hasIdentity } from './PersonIdentity'
import type { PersonIdentity } from '../types'

const merged = (...entries: [string, string, PersonIdentity['merged']['entries'][number]['tier']][]) => ({
  count: entries.length,
  tier: TIERS.find(t => entries.some(e => e[2] === t)) ?? null,
  entries: entries.map(([name, basis, tier]) => ({ name, at: '2026-11-21T05:34:18+00:00', basis, tier })),
})

const YANAI: PersonIdentity = {
  merged: merged(['Tadashi Yanai', 'birth_month_rare_name', 'likely'], ['T. Yanai', 'manual', 'confirmed']),
  namesakes: { count: 0, entries: [] },
}
const SMITH: PersonIdentity = {
  merged: { count: 0, tier: null, entries: [] },
  namesakes: { count: 12, entries: [
    { id: 'chpsc:1', full_name: 'David Smith', birth_date: '1961-03', companies: ['Acme Ltd', 'Bolt Ltd'] },
    { id: 'chpsc:2', full_name: 'Smith David', birth_date: '1961-03', companies: [] },
  ] },
}

describe('whether there is anything to say', () => {
  it('says nothing for a person nobody was merged into and nobody shares the name with', () => {
    const none: PersonIdentity = { merged: { count: 0, tier: null, entries: [] }, namesakes: null }
    expect(hasIdentity(none)).toBe(false)
    expect(hasIdentity(undefined)).toBe(false)             // an older backend
    const { container } = render(<PersonIdentitySection identity={none} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('speaks for a merge alone and for namesakes alone', () => {
    expect(hasIdentity(YANAI)).toBe(true)
    expect(hasIdentity(SMITH)).toBe(true)
  })
})

describe('a person made of several records', () => {
  it('states the count and the weakest link without being opened', () => {
    render(<PersonIdentitySection identity={YANAI} />)
    expect(screen.getByText('Combined with 2 other records')).toBeInTheDocument()
    // the person is as sure as its least certain merge — and says so in words
    expect(screen.getByText('Likely')).toBeInTheDocument()
    expect(screen.queryByText('T. Yanai')).not.toBeInTheDocument()
  })

  it('lists each record with its evidence and how sure it is, once opened', () => {
    render(<PersonIdentitySection identity={YANAI} />)
    fireEvent.click(screen.getByRole('button', { name: 'How this record was put together' }))
    const rows = within(screen.getByRole('list', { name: 'Records combined into this person' })).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Same uncommon name and birth month')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Likely')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Combined by an editor')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Checked by an editor')).toBeInTheDocument()
  })

  it('uses the singular for one record', () => {
    render(<PersonIdentitySection identity={{ merged: merged(['A B', 'register_number', 'proof']), namesakes: null }} />)
    expect(screen.getByText('Combined with 1 other record')).toBeInTheDocument()
    expect(screen.getByText('Certain')).toBeInTheDocument()
  })

  it('words a basis it does not know as a name match, never as a code', () => {
    expect(basisKey('something_new')).toBe('identity.basis.name')
    render(<PersonIdentitySection identity={{ merged: merged(['A B', 'something_new', 'likely']), namesakes: null }} />)
    fireEvent.click(screen.getByRole('button', { name: 'How this record was put together' }))
    expect(screen.getByText('Same name')).toBeInTheDocument()
    expect(screen.queryByText(/something_new/)).not.toBeInTheDocument()
  })
})

describe('the others of the name and birth month', () => {
  it('says how many there are and that they were not combined', () => {
    render(<PersonIdentitySection identity={SMITH} />)
    expect(screen.getByText('12 other entries have this name and birth month')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'How this record was put together' }))
    expect(screen.getByText('Not combined with this record: nothing shows they are the same person.')).toBeInTheDocument()
    const rows = within(screen.getByRole('list', { name: 'Other entries with this name and birth month' })).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Acme Ltd, Bolt Ltd')).toBeInTheDocument()
    expect(screen.getByText('and 10 more')).toBeInTheDocument()          // 12 in all, 2 listed
  })

  it('opens one of them', () => {
    const open = vi.fn()
    render(<PersonIdentitySection identity={SMITH} onOpenPerson={open} />)
    fireEvent.click(screen.getByRole('button', { name: 'How this record was put together' }))
    fireEvent.click(screen.getByRole('button', { name: 'Smith David' }))
    expect(open).toHaveBeenCalledWith(SMITH.namesakes!.entries[1])
  })

  it('has no merge line for a person nothing was merged into', () => {
    render(<PersonIdentitySection identity={SMITH} />)
    expect(screen.queryByText(/Combined with/)).not.toBeInTheDocument()
  })
})

describe('the wording', () => {
  const load = (locale: string) =>
    JSON.parse(readFileSync(join(__dirname, `../i18n/locales/${locale}.json`), 'utf-8')).identity as
      { basis: Record<string, string>; tier: Record<string, string>; tierHint: Record<string, string> }

  it.each(['en', 'de', 'es'])('%s has a wording for every basis and every tier the backend can send', locale => {
    const identity = load(locale)
    expect(Object.keys(identity.basis).sort()).toEqual([...BASES].sort())
    expect(Object.keys(identity.tier).sort()).toEqual([...TIERS].sort())
    expect(Object.keys(identity.tierHint).sort()).toEqual([...TIERS].sort())
  })
})
