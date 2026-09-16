import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toast from './Toast'

afterEach(() => vi.useRealTimers())

describe('Toast (render)', () => {
  it('renders nothing when there is no toast', () => {
    const { container } = render(<Toast toast={null} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the message and a type-specific class', () => {
    const { container } = render(<Toast toast={{ message: 'Saved!', type: 'success' }} onClose={vi.fn()} />)
    expect(screen.getByText('Saved!')).toBeInTheDocument()
    expect(container.querySelector('.toast')).toHaveClass('toast--success')
  })

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn()
    render(<Toast toast={{ message: 'Oops', type: 'error' }} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('auto-dismisses after 4s', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<Toast toast={{ message: 'bye', type: 'info' }} onClose={onClose} />)
    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(4000) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a sticky toast never auto-dismisses — a refresh summary must not be missed', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    render(<Toast toast={{ message: 'Refresh of Acme finished', type: 'success', sticky: true }} onClose={onClose} />)
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Refresh of Acme finished')).toBeInTheDocument()
  })

  it('a sticky toast still closes on the button', async () => {
    const onClose = vi.fn()
    render(<Toast toast={{ message: 'done', type: 'success', sticky: true }} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
