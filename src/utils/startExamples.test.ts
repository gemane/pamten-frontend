import { describe, it, expect } from 'vitest'
import { START_EXAMPLES } from './startExamples'

describe('start-page suggestions', () => {
  it('each opens a node by a stable key, once', () => {
    const ids = START_EXAMPLES.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    // a register's key or a QID — never a uuid, which a rebuild re-mints
    for (const id of ids) expect(id).toMatch(/^(lei|gb-coh|sec|wd):[A-Z0-9]+$/)
  })

  it('names each one once', () => {
    const labels = START_EXAMPLES.map(e => e.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})
