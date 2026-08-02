import { describe, it, expect } from 'vitest'
import { systemLanguage } from './systemLanguage'

describe('systemLanguage', () => {
  it('maps a regional browser preference to the supported base language', () => {
    expect(systemLanguage(['de-AT'])).toBe('de')
    expect(systemLanguage(['es-MX', 'en-US'])).toBe('es')
    expect(systemLanguage(['en-GB'])).toBe('en')
  })

  it('walks the preference list to the first supported language', () => {
    expect(systemLanguage(['fr-FR', 'it', 'de'])).toBe('de')
  })

  it('falls back to English when nothing is supported or the list is empty', () => {
    expect(systemLanguage(['fr', 'it'])).toBe('en')
    expect(systemLanguage([])).toBe('en')
  })
})
