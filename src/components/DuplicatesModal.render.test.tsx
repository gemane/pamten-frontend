import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DuplicatesModal from './DuplicatesModal'
import type { DuplicateGroup } from '../types'

vi.mock('../services/api', () => ({
  getPersonDuplicates: vi.fn(),
  getMergeLog: vi.fn(),
  getKeptSeparate: vi.fn(),
  mergePersons: vi.fn(),
  runDeduplicate: vi.fn(),
  keepSeparate: vi.fn(),
  undoKeepSeparate: vi.fn(),
  getPersonProfile: vi.fn(),
}))
import { getPersonDuplicates, getMergeLog, getKeptSeparate, getPersonProfile, keepSeparate } from '../services/api'

const group: DuplicateGroup = {
  confidence: 'high',
  reason: 'same name + shared company',
  suggested_keep_id: 'p1',
  members: [
    { id: 'p1', full_name: 'Larry Page' },
    { id: 'p2', full_name: 'Page Lawrence' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPersonDuplicates).mockResolvedValue({ data: { groups: [group] } } as never)
  vi.mocked(getMergeLog).mockResolvedValue({ data: { entries: [] } } as never)
  vi.mocked(getKeptSeparate).mockResolvedValue({ data: { pairs: [] } } as never)
})

describe('DuplicatesModal (render)', () => {
  it('renders a duplicate group with its members and reason', async () => {
    render(<DuplicatesModal onClose={vi.fn()} />)
    expect(await screen.findByText('Larry Page')).toBeInTheDocument()
    expect(screen.getByText('Page Lawrence')).toBeInTheDocument()
    expect(screen.getByText(/same name \+ shared company/i)).toBeInTheDocument()
  })

  it('shows the review tab count', async () => {
    render(<DuplicatesModal onClose={vi.fn()} />)
    // "To review" tab reflects the one pending group.
    expect(await screen.findByText(/To review/i)).toBeInTheDocument()
  })

  it('closes via the close button', async () => {
    const onClose = vi.fn()
    render(<DuplicatesModal onClose={onClose} />)
    await screen.findByText('Larry Page')
    await userEvent.click(screen.getAllByRole('button')[0])   // the × close
    expect(onClose).toHaveBeenCalled()
  })
})

describe('DuplicatesModal — pages', () => {
  const many = (n: number): DuplicateGroup[] => Array.from({ length: n }, (_, i) => ({
    confidence: 'medium', reason: `reason ${i}`, suggested_keep_id: `a${i}`,
    members: [{ id: `a${i}`, full_name: `Person ${i} A` }, { id: `b${i}`, full_name: `Person ${i} B` }],
  }))

  it('shows no pager for a list that fits one page', async () => {
    render(<DuplicatesModal onClose={vi.fn()} />)
    await screen.findByText('Larry Page')
    expect(screen.queryByText('Next')).not.toBeInTheDocument()
  })

  it('shows twenty groups a page and turns the page', async () => {
    vi.mocked(getPersonDuplicates).mockResolvedValue({ data: { groups: many(45) } } as never)
    render(<DuplicatesModal onClose={vi.fn()} />)
    expect(await screen.findByText('Person 0 A')).toBeInTheDocument()
    expect(screen.getByText('Person 19 A')).toBeInTheDocument()
    expect(screen.queryByText('Person 20 A')).not.toBeInTheDocument()
    expect(screen.getByText('1–20 of 45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByText('Person 20 A')).toBeInTheDocument()
    expect(screen.queryByText('Person 0 A')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByText('41–45 of 45')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled()
  })

  it('pulls the page back when its last group is gone', async () => {
    vi.mocked(getPersonDuplicates).mockResolvedValue({ data: { groups: many(21) } } as never)
    vi.mocked(keepSeparate).mockResolvedValue({ data: {} } as never)
    render(<DuplicatesModal onClose={vi.fn()} />)
    await screen.findByText('Person 0 A')
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(screen.getByText('Person 20 A')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Keep separate/ }))
    expect(await screen.findByText('Person 0 A')).toBeInTheDocument()     // back on page one, no empty page
    expect(screen.queryByText('Next')).not.toBeInTheDocument()            // twenty left: one page
  })

  it('starts a new page at its top', async () => {
    vi.mocked(getPersonDuplicates).mockResolvedValue({ data: { groups: many(45) } } as never)
    const { container } = render(<DuplicatesModal onClose={vi.fn()} />)
    await screen.findByText('Person 0 A')
    const list = container.querySelector('.dup-list') as HTMLElement
    list.scrollTop = 900
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(list.scrollTop).toBe(0)
  })

  it('keeps a page per tab', async () => {
    vi.mocked(getPersonDuplicates).mockResolvedValue({ data: { groups: many(45) } } as never)
    vi.mocked(getMergeLog).mockResolvedValue({ data: { entries: Array.from({ length: 25 }, (_, i) => ({
      id: `m${i}`, keep_id: `k${i}`, keep_name: `Kept ${i}`, dup_name: `Dup ${i}` })) } } as never)
    render(<DuplicatesModal onClose={vi.fn()} />)
    await screen.findByText('Person 0 A')
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Merged/ }))
    expect(screen.getByText('Kept 0')).toBeInTheDocument()
    expect(screen.getByText('1–20 of 25')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /To review/ }))
    expect(screen.getByText('Person 20 A')).toBeInTheDocument()            // where the reviewer left it
  })
})

describe('DuplicatesModal — comparison', () => {
  const profile = (name: string, born: string, companies: Array<[string, string, string]>) => ({ data: {
    person: { id: name, first_name: '', last_name: '', full_name: name, birth_date: born, nationalities: ['US'] },
    positions: companies.map(([id, company, role]) => ({ entity: { id, name: company }, role: { role, since: '2014-01-01' } })),
    holdings: [],
  } })

  beforeEach(() => {
    vi.mocked(getPersonProfile).mockImplementation(((id: string) => Promise.resolve(id === 'p1'
      ? profile('Larry Page', '1973-03-26', [['e1', 'Alphabet Inc.', 'Director'], ['e2', 'Google LLC', 'CEO']])
      : profile('Page Lawrence', '1973-03-00', [['e1', 'Alphabet Inc.', 'Director'], ['e3', 'Tesla, Inc.', 'Director']]))) as never)
  })

  it('reads no profile until a comparison is opened', async () => {
    render(<DuplicatesModal onClose={vi.fn()} />)
    await screen.findByText('Larry Page')
    expect(getPersonProfile).not.toHaveBeenCalled()
  })

  it('lays the records side by side and marks the company both name', async () => {
    render(<DuplicatesModal onClose={vi.fn()} />)
    await screen.findByText('Larry Page')
    await userEvent.click(screen.getByRole('button', { name: /Compare/ }))
    expect(await screen.findByText('Google LLC')).toBeInTheDocument()
    expect(screen.getByText('Tesla, Inc.')).toBeInTheDocument()
    expect(getPersonProfile).toHaveBeenCalledTimes(2)
    const shared = screen.getAllByText('Alphabet Inc.').map(el => el.closest('li')!)
    expect(shared).toHaveLength(2)
    shared.forEach(li => expect(li).toHaveClass('dup-compare__company--shared'))
    expect(screen.getByText('Google LLC').closest('li')).not.toHaveClass('dup-compare__company--shared')
    expect(screen.getByText('Mar 26, 1973')).toBeInTheDocument()
    expect(screen.getByText('Mar 1973')).toBeInTheDocument()
    expect(screen.getAllByText('Director · 2014–')).toHaveLength(3)
  })

  it('links each record to the graph and closes again', async () => {
    render(<DuplicatesModal onClose={vi.fn()} />)
    await screen.findByText('Larry Page')
    await userEvent.click(screen.getByRole('button', { name: /Compare/ }))
    await screen.findByText('Google LLC')
    const links = screen.getAllByTitle(/Open in the graph/)
    expect(links.map(a => a.getAttribute('href'))).toEqual(['#graph/p/p1', '#graph/p/p2'])
    await userEvent.click(screen.getByRole('button', { name: /Hide comparison/ }))
    expect(screen.queryByText('Google LLC')).not.toBeInTheDocument()
  })

  it('says which record could not be read and still shows the other', async () => {
    vi.mocked(getPersonProfile).mockImplementation(((id: string) => id === 'p1'
      ? Promise.reject(new Error('gone'))
      : Promise.resolve(profile('Page Lawrence', '1973-03-00', [['e3', 'Tesla, Inc.', 'Director']]))) as never)
    render(<DuplicatesModal onClose={vi.fn()} />)
    await screen.findByText('Larry Page')
    await userEvent.click(screen.getByRole('button', { name: /Compare/ }))
    expect(await screen.findByText('Tesla, Inc.')).toBeInTheDocument()
    expect(screen.getByText(/could not be loaded/)).toBeInTheDocument()
  })
})
