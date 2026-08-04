import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Breadcrumb from './Breadcrumb'
import type { NodeData } from '../types'

const node = (id: string, label: string): NodeData => ({ id, label, nodeType: 'entity', raw: {} as NodeData['raw'] })

describe('Breadcrumb (render)', () => {
  it('renders nothing for a single-item (or empty) history', () => {
    const { container } = render(<Breadcrumb history={[node('a', 'Alpha')]} onNavigate={vi.fn()} />)
    expect(container.querySelector('.breadcrumb')).toBeNull()
  })

  it('renders the trail with only the last item non-clickable, and navigates on click', async () => {
    const onNavigate = vi.fn()
    render(<Breadcrumb history={[node('a', 'Alpha'), node('b', 'Beta'), node('c', 'Gamma')]} onNavigate={onNavigate} />)

    // Ancestors are buttons; the current (last) node is plain text.
    const alpha = screen.getByRole('button', { name: 'Alpha' })
    expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gamma' })).toBeNull()
    expect(screen.getByText('Gamma')).toBeInTheDocument()

    await userEvent.click(alpha)
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 0)
  })
})
