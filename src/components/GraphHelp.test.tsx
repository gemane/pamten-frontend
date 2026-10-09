import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import GraphHelp from './GraphHelp'

describe('GraphHelp — the reading-the-graph glossary', () => {
  it('is always open — a titled section, not a disclosure to find and click', () => {
    render(<GraphHelp />)
    expect(document.querySelector('section.graph-help')).toBeTruthy()
    expect(document.querySelector('details')).toBeNull()
    expect(screen.getByText('Help — reading the graph')).toBeInTheDocument()
    expect(screen.getByText('dimmed entry')).toBeInTheDocument()
  })

  it('shows every marker the graph uses', () => {
    render(<GraphHelp />)
    expect(screen.getByText('✓ 2')).toBeInTheDocument()
    expect(screen.getByText('⚡')).toBeInTheDocument()
    // The reading chip: the sample is the weakest grade, with its explanation.
    const chip = screen.getByText('from narrative')
    expect(chip.className).toContain('reading-badge--narrative')
    expect(screen.getByText(/read off the page's layout, a list in text or a sentence/i)).toBeInTheDocument()
    expect(document.querySelectorAll('.help-dot').length).toBeGreaterThanOrEqual(9)
    expect(document.querySelector('.help-edge--dashed')).toBeTruthy()
    expect(document.querySelector('.help-edge--dotted')).toBeTruthy()
  })

  it('carries no settings-page class', () => {
    render(<GraphHelp />)
    expect(document.querySelector('[class*="settings-"]')).toBeNull()
  })
})
