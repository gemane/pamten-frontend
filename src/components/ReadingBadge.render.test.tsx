/**
 * The reading cue on a relationship row.
 *
 * Four grades, two of them worth a mark. The boundary is the whole component:
 * a structured field and a table cell — the normal case — must stay silent,
 * as must "unknown" (null, or no field at all), or every GLEIF row grows a
 * chip. Layout and prose each get their own label and their own hint, and
 * the two must not be swapped: "inferred" is a weaker warning than "from
 * text", and the hint has to explain the one the reader is looking at.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ReadingBadge, { readingGrade } from './ReadingBadge'

describe('readingGrade', () => {
  it('passes the two weak grades through', () => {
    expect(readingGrade('layout')).toBe('layout')
    expect(readingGrade('prose')).toBe('prose')
  })

  it('says nothing about the normal and unknown cases', () => {
    expect(readingGrade('field')).toBeNull()
    expect(readingGrade('table')).toBeNull()
    expect(readingGrade(null)).toBeNull()
    expect(readingGrade(undefined)).toBeNull()
  })
})

describe('what it renders', () => {
  it('renders nothing for a structured field', () => {
    const { container } = render(<ReadingBadge rel={{ read_from: 'field' }} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for a table cell', () => {
    const { container } = render(<ReadingBadge rel={{ read_from: 'table' }} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when the grade is unknown', () => {
    const { container: a } = render(<ReadingBadge rel={{ read_from: null }} />)
    const { container: b } = render(<ReadingBadge rel={{}} />)
    const { container: c } = render(<ReadingBadge rel={undefined} />)
    expect(a.firstChild).toBeNull()
    expect(b.firstChild).toBeNull()
    expect(c.firstChild).toBeNull()
  })

  it('marks a layout reading as inferred, with the layout hint', () => {
    render(<ReadingBadge rel={{ read_from: 'layout' }} />)
    const badge = screen.getByText('inferred')
    expect(badge.className).toContain('reading-badge--layout')
    expect(badge.className).not.toContain('reading-badge--prose')
    expect(badge.getAttribute('title')).toMatch(/page's layout/i)
    expect(badge.getAttribute('title')).not.toMatch(/running text/i)
  })

  it('marks a prose reading as from text, with the prose hint', () => {
    render(<ReadingBadge rel={{ read_from: 'prose' }} />)
    const badge = screen.getByText('from text')
    expect(badge.className).toContain('reading-badge--prose')
    expect(badge.className).not.toContain('reading-badge--layout')
    expect(badge.getAttribute('title')).toMatch(/running text/i)
    expect(badge.getAttribute('title')).toMatch(/least certain/i)
  })
})
