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
    expect(document.querySelectorAll('.help-dot').length).toBeGreaterThanOrEqual(9)
    expect(document.querySelector('.help-edge--dashed')).toBeTruthy()
    expect(document.querySelector('.help-edge--dotted')).toBeTruthy()
  })

  it('carries no settings-page class', () => {
    render(<GraphHelp />)
    expect(document.querySelector('[class*="settings-"]')).toBeNull()
  })
})
