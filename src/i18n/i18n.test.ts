import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const load = (locale: string) =>
  JSON.parse(readFileSync(join(__dirname, `locales/${locale}.json`), 'utf-8')) as Record<string, unknown>

// Returns every dot-separated key path in a nested object
function leafPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const full = prefix ? `${prefix}.${k}` : k
    return v !== null && typeof v === 'object' ? leafPaths(v as Record<string, unknown>, full) : [full]
  })
}

const en = load('en')
const de = load('de')
const es = load('es')

const enPaths = leafPaths(en)

describe('i18n locale completeness', () => {
  it('de.json contains every key that en.json has', () => {
    const dePaths = new Set(leafPaths(de))
    const missing = enPaths.filter(p => !dePaths.has(p))
    expect(missing, `Missing in de.json: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('es.json contains every key that en.json has', () => {
    const esPaths = new Set(leafPaths(es))
    const missing = enPaths.filter(p => !esPaths.has(p))
    expect(missing, `Missing in es.json: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('de.json has no empty string values', () => {
    const empty = leafPaths(de).filter(p => {
      const val = p.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)[k], de)
      return val === ''
    })
    expect(empty, `Empty strings in de.json: ${empty.join(', ')}`).toHaveLength(0)
  })

  it('es.json has no empty string values', () => {
    const empty = leafPaths(es).filter(p => {
      const val = p.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)[k], es)
      return val === ''
    })
    expect(empty, `Empty strings in es.json: ${empty.join(', ')}`).toHaveLength(0)
  })

  it('de.json has no keys that en.json does not have (no orphans)', () => {
    const enSet  = new Set(enPaths)
    const orphan = leafPaths(de).filter(p => !enSet.has(p))
    expect(orphan, `Orphan keys in de.json: ${orphan.join(', ')}`).toHaveLength(0)
  })

  it('es.json has no keys that en.json does not have (no orphans)', () => {
    const enSet  = new Set(enPaths)
    const orphan = leafPaths(es).filter(p => !enSet.has(p))
    expect(orphan, `Orphan keys in es.json: ${orphan.join(', ')}`).toHaveLength(0)
  })
})
