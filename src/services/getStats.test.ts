import { describe, it, expect, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
get.mockResolvedValue({
  data: { companies: 14156151, people: 10712221, relationships: 1122319, sources: 4 },
})

vi.mock('axios', () => ({
  default: {
    create: () => ({
      get,
      interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    }),
  },
}))

import { getStats } from './api'

describe('getStats', () => {
  it('GETs /stats and returns the counts', async () => {
    const res = await getStats()
    expect(get).toHaveBeenCalledWith('/stats')
    expect(res.data).toEqual({
      companies: 14156151, people: 10712221, relationships: 1122319, sources: 4,
    })
  })
})
