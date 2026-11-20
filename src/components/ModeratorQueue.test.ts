import { describe, it, expect } from 'vitest'
import { describeTarget, mergeQuestionOf } from './ModeratorQueue'
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

describe('mergeQuestionOf', () => {
  const detail = { code: 'merged_person', message: '', fields: [], merges: [] }
  it('reads the question out of the 409', () => {
    expect(mergeQuestionOf({ response: { status: 409, data: { detail } } })).toEqual(detail)
  })
  it('is not fooled by another 409, another status, or no response at all', () => {
    expect(mergeQuestionOf({ response: { status: 409, data: { detail: 'this merge was already undone' } } })).toBeNull()
    expect(mergeQuestionOf({ response: { status: 409, data: { detail: { ...detail, code: 'something_else' } } } })).toBeNull()
    expect(mergeQuestionOf({ response: { status: 500, data: { detail } } })).toBeNull()
    expect(mergeQuestionOf(new Error('network'))).toBeNull()
    expect(mergeQuestionOf(null)).toBeNull()
  })
})

