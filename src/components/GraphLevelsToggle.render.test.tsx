import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GraphLevelsToggle from './GraphLevelsToggle'

describe('GraphLevelsToggle', () => {
  it('names what it switches and shows both choices, with the current one checked', () => {
    render(<GraphLevelsToggle on={false} onChange={() => {}} />)
    expect(screen.getByRole('radiogroup', { name: 'Subsidiaries' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Direct' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'All levels' })).toHaveAttribute('aria-checked', 'false')
  })

  it('asks for all levels, and for direct again', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<GraphLevelsToggle on={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'All levels' }))
    expect(onChange).toHaveBeenLastCalledWith(true)
    rerender(<GraphLevelsToggle on onChange={onChange} />)
    expect(screen.getByRole('radio', { name: 'All levels' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('radio', { name: 'Direct' }))
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('clicking the choice that is already on does nothing', async () => {
    const onChange = vi.fn()
    render(<GraphLevelsToggle on onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'All levels' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
