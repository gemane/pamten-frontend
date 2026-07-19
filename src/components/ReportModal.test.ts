import { describe, it, expect } from 'vitest'
import { categoriesFor } from './ReportModal'

describe('categoriesFor', () => {
  it('offers node-appropriate reasons for entity/person targets', () => {
    const node = categoriesFor('entity')
    expect(node).toContain('not-real')
    expect(node).toContain('duplicate')
    expect(node).not.toContain('wrong-percent')   // % describes an edge, not a node
    expect(categoriesFor('person')).toEqual(node)
  })

  it('offers edge-appropriate reasons for owns/role targets', () => {
    const edge = categoriesFor('owns')
    expect(edge).toContain('wrong-percent')
    expect(edge).toContain('wrong-owner')
    expect(edge).not.toContain('not-real')        // an edge can't be "not a real entity"
    expect(categoriesFor('role')).toEqual(edge)
  })
})
