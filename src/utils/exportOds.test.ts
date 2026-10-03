import { describe, it, expect, vi, afterEach } from 'vitest'
import { downloadBlob, exportParams, filenameFromDisposition } from './exportOds'
import { STAKE_FILTERS, ANY_STAKE, DEFAULT_STAKE } from '../components/GraphStakeFilter'

const by = (id: string) => STAKE_FILTERS.find(f => f.id === id)!

describe('exportParams — the current view, only what is off its default', () => {
  it('sends nothing for the present, direct, any stake', () => {
    expect(exportParams({ asOf: null, allLevels: false, stake: ANY_STAKE })).toEqual({})
  })

  it('sends the day, the levels and the stake band as the server names them', () => {
    expect(exportParams({ asOf: '2019-12-31', allLevels: true, stake: DEFAULT_STAKE, link: 'https://owlgraph.example/#g' }))
      .toEqual({ as_of: '2019-12-31', all_levels: true, min_stake: 1, link: 'https://owlgraph.example/#g' })
  })

  it('says when the band is strictly above its threshold', () => {
    expect(exportParams({ asOf: null, allLevels: false, stake: by('gt50') })).toEqual({ min_stake: 50, min_stake_exclusive: true })
    expect(exportParams({ asOf: null, allLevels: false, stake: by('gte25') })).toEqual({ min_stake: 25 })
  })

  it('sends only an http(s) link — the server refuses anything else', () => {
    expect(exportParams({ asOf: null, allLevels: false, stake: ANY_STAKE, link: 'file:///x' })).toEqual({})
    expect(exportParams({ asOf: null, allLevels: false, stake: ANY_STAKE, link: 'http://localhost:5173/#graph' })).toEqual({ link: 'http://localhost:5173/#graph' })
  })
})

describe('filenameFromDisposition — the name the server chose', () => {
  it('prefers the UTF-8 name, decoded', () => {
    expect(filenameFromDisposition('attachment; filename="N?me as of 2019.ods"; filename*=UTF-8\'\'N%C3%A4me%20as%20of%202019.ods', 'x.ods'))
      .toBe('Näme as of 2019.ods')
  })

  it('falls back to the plain name, quoted or bare, then to the default', () => {
    expect(filenameFromDisposition('attachment; filename="Microsoft.ods"', 'x.ods')).toBe('Microsoft.ods')
    expect(filenameFromDisposition('attachment; filename=plain.ods', 'x.ods')).toBe('plain.ods')
    expect(filenameFromDisposition('attachment', 'x.ods')).toBe('x.ods')
    expect(filenameFromDisposition(null, 'x.ods')).toBe('x.ods')
    expect(filenameFromDisposition('attachment; filename="a.ods"; filename*=UTF-8\'\'%E0%A4%A', 'x.ods')).toBe('a.ods')   // bad encoding
  })
})

describe('downloadBlob', () => {
  afterEach(() => vi.restoreAllMocks())

  it('clicks an anchor at an object URL named after the file, then releases the URL', () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('Microsoft.ods')
      expect(this.href).toBe('blob:x')
    })
    downloadBlob(new Blob(['x']), 'Microsoft.ods')
    expect(create).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledWith('blob:x')
  })
})
