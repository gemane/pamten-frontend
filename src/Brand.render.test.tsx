import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// App pulls in the whole shell; the logo needs none of it.
vi.mock('./components/Graph', () => ({ default: () => null }))
vi.mock('./components/MapView', () => ({ default: () => null }))

import { Brand } from './App'

describe('Brand — the logo, in the sidebar and above the phone\'s search bar', () => {
  it('goes home on a click and names the product', async () => {
    const onHome = vi.fn()
    render(<Brand onHome={onHome} title="Home" />)
    expect(screen.getByText('Owlgraph')).toBeInTheDocument()
    expect(screen.getByText('Ownership Graph')).toBeInTheDocument()
    await userEvent.click(screen.getByTitle('Home'))
    expect(onHome).toHaveBeenCalledTimes(1)
  })

  it('is smaller on a phone, and only mark and wordmark: no subtitle', () => {
    const { container, rerender } = render(<Brand onHome={() => {}} title="Home" />)
    const mark = () => container.querySelector('img.logo-mark') as HTMLImageElement
    expect(mark().getAttribute('width')).toBe('48')
    expect(container.querySelector('.logo-group--compact')).toBeNull()
    rerender(<Brand compact onHome={() => {}} title="Home" />)
    expect(mark().getAttribute('width')).toBe('32')
    expect(container.querySelector('.logo-group--compact')).not.toBeNull()
    expect(screen.getByText('Owlgraph')).toBeInTheDocument()
    expect(screen.queryByText('Ownership Graph')).toBeNull()
  })
})
