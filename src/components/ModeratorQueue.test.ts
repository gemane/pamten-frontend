import { describe, it, expect } from 'vitest'
import { describeTarget } from './ModeratorQueue'
import type { Flag } from '../types'

const base: Flag = {
  id: 'f', target_kind: 'entity', category: 'not-real', note: '', status: 'open',
  reporter_kind: 'anon', from_id: '', to_id: '', role: '', node_id: 'ent-1',
  created_at: '2026-07-19', updated_at: '2026-07-19',
}

describe('describeTarget', () => {
  it('node target shows the node id', () => {
    expect(describeTarget({ ...base, target_kind: 'entity', node_id: 'ent-1' })).toBe('ent-1')
  })
  it('owns edge shows from → to', () => {
    expect(describeTarget({ ...base, target_kind: 'owns', from_id: 'a', to_id: 'b' })).toBe('a → b')
  })
  it('role edge appends the role', () => {
    expect(describeTarget({ ...base, target_kind: 'role', from_id: 'p', to_id: 'e', role: 'CEO' }))
      .toBe('p → e (CEO)')
  })
})
