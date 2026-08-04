import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScrapeOverlay from './ScrapeOverlay'

describe('ScrapeOverlay (render)', () => {
  it('names the company being searched', () => {
    render(<ScrapeOverlay company="Microsoft Corporation" />)
    expect(screen.getByText(/Microsoft Corporation/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('adds the fullscreen modifier only when requested', () => {
    const { container, rerender } = render(<ScrapeOverlay company="Acme" />)
    expect(container.querySelector('.scrape-overlay')).not.toHaveClass('scrape-overlay--fullscreen')

    rerender(<ScrapeOverlay company="Acme" fullscreen />)
    expect(container.querySelector('.scrape-overlay')).toHaveClass('scrape-overlay--fullscreen')
  })
})
