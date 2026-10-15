import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImageZoom from './ImageZoom'

const credit = {
  url: '/media/person/p1/file?v=abc', large_url: '/media/person/p1/file?size=large&v=abc',
  author: 'Jane Doe', license: 'CC BY-SA 4.0', license_url: null,
  file_page: 'https://commons.wikimedia.org/wiki/File:X.jpg',
  attribution_required: true, source: 'Wikimedia Commons',
}
const image = { src: 'http://api.test/thumb', large: 'http://api.test/large', credit }

// jsdom never loads images: capture the preloader and fire its events by hand.
const loaders: { src: string; onload: (() => void) | null; onerror: (() => void) | null }[] = []
class FakeImage {
  src = ''; onload: (() => void) | null = null; onerror: (() => void) | null = null
  constructor() { loaders.push(this) }
}
vi.stubGlobal('Image', FakeImage)
afterEach(() => { loaders.length = 0 })

const zoomImg = () => screen.getByTestId('image-zoom').querySelector('img') as HTMLImageElement

describe('the portrait opens big', () => {
  it('a click opens the picture with its credit, showing the thumbnail until the large file loads', async () => {
    render(<ImageZoom image={image} alt="Ryan Roslansky" />)
    expect(screen.queryByTestId('image-zoom')).toBeNull()
    expect(loaders).toHaveLength(0)                               // nothing big fetched with the panel

    await userEvent.click(screen.getByRole('button', { name: /Show the photo of .* larger/ }))
    expect(screen.getByRole('dialog', { name: 'Ryan Roslansky' })).toBeInTheDocument()
    expect(zoomImg().src).toBe('http://api.test/thumb')
    expect(screen.getByTestId('image-zoom')).toHaveTextContent('Jane Doe')

    expect(loaders[0].src).toBe('http://api.test/large')
    act(() => loaders[0].onload?.())
    expect(zoomImg().src).toBe('http://api.test/large')
  })

  it('a large file that fails leaves the thumbnail', async () => {
    render(<ImageZoom image={image} alt="R" />)
    await userEvent.click(screen.getByRole('button', { name: /Show the photo of .* larger/ }))
    act(() => loaders[0].onerror?.())
    expect(zoomImg().src).toBe('http://api.test/thumb')
  })

  it('without a large rendition the thumbnail is shown big', async () => {
    render(<ImageZoom image={{ ...image, large: undefined }} alt="R" />)
    await userEvent.click(screen.getByRole('button', { name: /Show the photo of .* larger/ }))
    expect(zoomImg().src).toBe('http://api.test/thumb')
    expect(loaders).toHaveLength(0)
  })

  it('closes on Escape, on the close button and on the backdrop, not on the picture', async () => {
    render(<ImageZoom image={image} alt="R" />)
    const open = () => userEvent.click(screen.getByRole('button', { name: /Show the photo of .* larger/ }))

    await open()
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('image-zoom')).toBeNull()

    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('image-zoom')).toBeNull()

    await open()
    await userEvent.click(zoomImg())
    expect(screen.getByTestId('image-zoom')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('image-zoom'))
    expect(screen.queryByTestId('image-zoom')).toBeNull()
  })
})
