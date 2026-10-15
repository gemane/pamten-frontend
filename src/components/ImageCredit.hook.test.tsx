import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../services/api', () => ({
  getMediaImage: vi.fn(),
  mediaFileUrl: (p: string) => `http://api.test${p}`,
}))
import { getMediaImage } from '../services/api'
import { useMediaImage } from './ImageCredit'

const credit = { url: '/media/person/p1/file?v=abc', author: null, license: 'CC0', license_url: null,
                 file_page: 'https://commons.wikimedia.org/wiki/File:X.jpg', attribution_required: false,
                 source: 'Wikimedia Commons' }

describe('useMediaImage', () => {
  it('resolves the large rendition beside the thumbnail', async () => {
    vi.mocked(getMediaImage).mockResolvedValue(
      { data: { ...credit, large_url: '/media/person/p1/file?size=large&v=abc' } } as never)
    const { result } = renderHook(() => useMediaImage('person', 'p1'))
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current!.src).toBe('http://api.test/media/person/p1/file?v=abc')
    expect(result.current!.large).toBe('http://api.test/media/person/p1/file?size=large&v=abc')
  })

  it('an API without large_url gives no large rendition', async () => {
    vi.mocked(getMediaImage).mockResolvedValue({ data: credit } as never)
    const { result } = renderHook(() => useMediaImage('person', 'p1'))
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current!.large).toBeUndefined()
  })
})
