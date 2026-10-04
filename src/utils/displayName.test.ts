import { describe, it, expect, afterEach } from 'vitest'
import { displayName, entityLabel, isLatin, latinName, readerScripts, scriptOf, setViewerLanguages, viewerScripts } from './displayName'

const nestleKorea = { name: '네슬레코리아 유한책임회사', other_names: ['Nestle Korea'] }
const nestleThai  = { name: 'บริษัท เนสท์เล่ (ไทย) จำกัด', other_names: ['NESTLE (THAI) LIMITED'] }

afterEach(() => setViewerLanguages(null))

describe('scriptOf — the script most of the letters are in', () => {
  it.each([
    ['네슬레코리아 유한책임회사', 'Hangul'],
    ['บริษัท เนสท์เล่ (ไทย) จำกัด', 'Thai'],
    ['雀巢（中国）有限公司', 'Han'],
    ['ネスレ日本株式会社', 'Japanese'],            // kana + Han is Japanese
    ['日本株式会社', 'Han'],                       // Han alone cannot say
    ['ООО «Нестле Россия»', 'Cyrillic'],
    ['نستله مصر', 'Arabic'],
    ['Nestlé Türkiye Gıda Sanayi A.Ş.', 'Latin'],
    ['Nestle Korea 네슬레코리아 유한책임회사', 'Hangul'],   // most letters decide
  ])('%s → %s', (name, script) => {
    expect(scriptOf(name)).toBe(script)
  })
  it('null without letters', () => {
    expect(scriptOf('1234 (5)')).toBeNull()
    expect(scriptOf('')).toBeNull()
  })
})

describe('isLatin — every letter Latin', () => {
  it('accepts accents and the Turkish dotted İ, digits and punctuation', () => {
    expect(isLatin('NESTLE TÜRKİYE GIDA SANAYİ ANONİM ŞİRKETİ')).toBe(true)
    expect(isLatin('Nestlé (Thai) Ltd. 2')).toBe(true)
  })
  it('refuses a name with any non-Latin letter, and one with no letters', () => {
    expect(isLatin('Nestle 코리아')).toBe(false)
    expect(isLatin('— 12 —')).toBe(false)
  })
})

describe('latinName — the register\'s Latin name for a non-Latin legal name', () => {
  it('the first Latin entry of other_names', () => {
    expect(latinName(nestleKorea)).toBe('Nestle Korea')
    expect(latinName({ name: '雀巢', other_names: ['雀巢公司', 'Nestle China', 'Nestlé'] })).toBe('Nestle China')
  })
  it('none for a Latin legal name, none without a Latin entry', () => {
    expect(latinName({ name: 'Nestle S.A.', other_names: ['Nestlé AG'] })).toBeNull()
    expect(latinName({ name: '雀巢', other_names: ['雀巢公司'] })).toBeNull()
    expect(latinName({ name: '雀巢' })).toBeNull()
    expect(latinName({ name: '雀巢', other_names: null })).toBeNull()
  })
})

describe('readerScripts — what a reader of these browser languages reads', () => {
  it('maps the language part of each tag', () => {
    expect([...readerScripts(['ko-KR', 'en-US'])]).toEqual(['Hangul', 'Han'])
    expect(readerScripts(['th']).has('Thai')).toBe(true)
    expect(readerScripts(['ja_JP']).has('Japanese')).toBe(true)
    expect(readerScripts(['ru']).has('Cyrillic')).toBe(true)
    expect(readerScripts(['zh-Hant-TW']).has('Han')).toBe(true)
  })
  it('nothing for Latin-script languages and unknown tags', () => {
    expect(readerScripts(['en', 'de-AT', 'es', 'xx']).size).toBe(0)
  })
})

describe('displayName — the names in the viewer\'s order', () => {
  it('a Korean reader sees the legal name first, the Latin one second', () => {
    const d = displayName(nestleKorea, readerScripts(['ko-KR', 'en']))
    expect(d).toEqual({ primary: '네슬레코리아 유한책임회사', secondary: 'Nestle Korea', secondaryKind: 'latin' })
  })
  it('everybody else sees the Latin name first, the legal one second', () => {
    expect(displayName(nestleKorea, readerScripts(['de-AT', 'en'])))
      .toEqual({ primary: 'Nestle Korea', secondary: '네슬레코리아 유한책임회사', secondaryKind: 'legal' })
    // reading Thai does not make one a reader of Hangul
    expect(displayName(nestleKorea, readerScripts(['th'])).primary).toBe('Nestle Korea')
    expect(displayName(nestleThai, readerScripts(['th'])).primary).toBe(nestleThai.name)
  })
  it('a name without a Latin counterpart stays as it is, for everyone — nothing is made up', () => {
    const plain = { name: '雀巢（中国）有限公司', other_names: [] }
    expect(displayName(plain, readerScripts(['en']))).toEqual({ primary: plain.name, secondary: null, secondaryKind: null })
  })
  it('a Latin legal name is shown alone, whatever other names the register has', () => {
    const latin = { name: 'Nestle S.A.', other_names: ['Nestlé AG', '雀巢'] }
    expect(displayName(latin, readerScripts(['ko']))).toEqual({ primary: 'Nestle S.A.', secondary: null, secondaryKind: null })
  })
  it('defaults to the browser\'s languages; entityLabel is the first name', () => {
    setViewerLanguages(['ko'])
    expect(viewerScripts().has('Hangul')).toBe(true)
    expect(entityLabel(nestleKorea)).toBe('네슬레코리아 유한책임회사')
    setViewerLanguages(['en-GB'])
    expect(entityLabel(nestleKorea)).toBe('Nestle Korea')
  })
})
