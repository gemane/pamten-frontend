import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GraphAsOfChip from './GraphAsOfChip'

describe('GraphAsOfChip', () => {
  it('names the year, explains the dimmed lines, and clears on ×', async () => {
    const onClear = vi.fn()
    render(<GraphAsOfChip asOf="2019-12-31" onClear={onClear} />)
    expect(screen.getByText('As of 2019')).toBeInTheDocument()
    expect(screen.getByText(/not documented for that year/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show the present' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
