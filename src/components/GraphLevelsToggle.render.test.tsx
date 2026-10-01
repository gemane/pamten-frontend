import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GraphLevelsToggle from './GraphLevelsToggle'

describe('GraphLevelsToggle', () => {
  it('off: offers all levels and asks for them on click', async () => {
    const onChange = vi.fn()
    render(<GraphLevelsToggle on={false} onChange={onChange} />)
    const btn = screen.getByRole('button', { name: 'Show all levels of subsidiaries' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('All levels')).toBeNull()
    await userEvent.click(btn)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('on: says so on the button and offers the way back', async () => {
    const onChange = vi.fn()
    render(<GraphLevelsToggle on onChange={onChange} />)
    expect(screen.getByText('All levels')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show direct subsidiaries only' }))
    expect(onChange).toHaveBeenCalledWith(false)
  })
})
