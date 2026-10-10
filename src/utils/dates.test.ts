import { describe, it, expect, afterEach } from 'vitest'
import { formatDate } from './dates'

describe('formatDate — a date as the viewer reads it', () => {
  it('writes a full date in the viewer\'s language', () => {
    expect(formatDate('2024-02-13', 'en')).toBe('Feb 13, 2024')
    expect(formatDate('2024-02-13', 'de')).toBe('13.02.2024')
    expect(formatDate('2024-02-13', 'es')).toBe('13 feb 2024')
  })

  afterEach(() => { delete process.env.TZ })

  it('never slips a day for a viewer west of Greenwich', () => {
    process.env.TZ = 'America/Los_Angeles'            // Node reads TZ at call time
    expect(formatDate('2024-02-13', 'en')).toBe('Feb 13, 2024')
    expect(formatDate('2026-07-12T23:30:00Z', 'en')).toBe('Jul 12, 2026')
  })

  it('takes the date of a timestamp, in UTC', () => {
    expect(formatDate('2026-07-12T09:00:00+00:00', 'en')).toBe('Jul 12, 2026')
    expect(formatDate('2026-07-12T23:30:00Z', 'en')).toBe('Jul 12, 2026')    // never the 13th
  })

  it('writes the partial dates registers leave behind', () => {
    expect(formatDate('2023-04-00', 'en')).toBe('Apr 2023')
    expect(formatDate('2023-04', 'de')).toBe('Apr. 2023')
    expect(formatDate('1955-00-00', 'en')).toBe('1955')
    expect(formatDate('1955', 'en')).toBe('1955')
    expect(formatDate(1955, 'en')).toBe('1955')
  })

  it('shows nothing for what is not a date', () => {
    for (const bad of [undefined, null, '', 'not-a-date', '2025-13-01', '2025-13-00', '2025-04-31', '2025-02-30', 12.5]) {
      expect(formatDate(bad as never, 'en')).toBeNull()
    }
  })

  it('falls back to English for a language Intl does not know', () => {
    expect(formatDate('2024-02-13', 'x-nonsense-!!')).toBe('Feb 13, 2024')
  })
})
