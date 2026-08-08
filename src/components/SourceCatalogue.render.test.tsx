import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SourceCatalogue from './SourceCatalogue'
import type { ScraperSource } from '../types'

const source = (over: Partial<ScraperSource> = {}): ScraperSource => ({
  name: 'sec_edgar', label: 'SEC EDGAR', enabled: true, kind: 'instant',
  url: 'https://www.sec.gov/edgar', credibility: 98, quality: 'statutory',
  description: 'SEC EDGAR — legally required US ownership filings',
  ...over,
})

describe('SourceCatalogue', () => {
  it('names each source and describes it', () => {
    render(<SourceCatalogue sources={[source()]} />)
    expect(screen.getByText('SEC EDGAR')).toBeInTheDocument()
    expect(screen.getByText(/legally required US ownership filings/)).toBeInTheDocument()
  })

  it('links out to the source itself', () => {
    render(<SourceCatalogue sources={[source()]} />)
    const link = screen.getByRole('link', { name: 'SEC EDGAR' })
    expect(link).toHaveAttribute('href', 'https://www.sec.gov/edgar')
    // Opening a third-party site in a new tab without noopener hands it a
    // window.opener reference back to us.
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('explains the reliability rather than showing a bare number', () => {
    // "98" alone tells a visitor nothing; the band is what carries the meaning.
    render(<SourceCatalogue sources={[source()]} />)
    expect(screen.getByText(/Legally mandated filings/)).toBeInTheDocument()
    expect(screen.getByText(/98/)).toBeInTheDocument()
  })

  it('orders the most authoritative source first', () => {
    render(<SourceCatalogue sources={[
      source({ name: 'wikidata', label: 'Wikidata', credibility: 80, quality: 'community' }),
      source({ name: 'sec_edgar', label: 'SEC EDGAR', credibility: 98 }),
    ]} />)
    const names = screen.getAllByText(/SEC EDGAR|Wikidata/).map(n => n.textContent)
    expect(names[0]).toBe('SEC EDGAR')
  })

  it('says how a source is consulted', () => {
    render(<SourceCatalogue sources={[source({ kind: 'bulk', name: 'bods_gleif', label: 'GLEIF' })]} />)
    expect(screen.getByText(/Bulk dataset import/)).toBeInTheDocument()
  })

  it('marks an on-demand source whose lookups are switched off', () => {
    render(<SourceCatalogue sources={[source({ enabled: false })]} />)
    expect(screen.getByText(/paused/i)).toBeInTheDocument()
  })

  it('does NOT call a bulk source paused just because its toggle is off', () => {
    // The toggle governs whether new imports run. GLEIF and UK PSC are both
    // toggled off while their data is loaded and in active use — saying "paused"
    // would tell the reader the opposite of the truth about where the data came
    // from.
    render(<SourceCatalogue sources={[
      source({ kind: 'bulk', name: 'bods_gleif', label: 'GLEIF', enabled: false }),
    ]} />)
    expect(screen.queryByText(/paused/i)).toBeNull()
  })

  it('renders nothing when there are no sources', () => {
    const { container } = render(<SourceCatalogue sources={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('survives a source missing its optional metadata', () => {
    // Rows written before the catalogue fields existed carry only the basics.
    render(<SourceCatalogue sources={[
      { name: 'legacy', description: 'An older row', enabled: true } as ScraperSource,
    ]} />)
    expect(screen.getByText('legacy')).toBeInTheDocument()
    expect(screen.getByText('An older row')).toBeInTheDocument()
  })
})
