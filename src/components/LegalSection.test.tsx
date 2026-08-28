/**
 * The legal links in Settings.
 *
 * These matter more than their size suggests: §5 ECG requires the imprint to be
 * easily and directly accessible, Google Play requires a reachable deletion URL,
 * and both stores require a privacy-policy URL. A broken href here is not a
 * cosmetic bug — it is a compliance failure that nothing else would catch, since
 * the pages are static files outside the app's own routing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { existsSync } from 'node:fs'
import i18n from '../i18n'
import SettingsPanel from './SettingsPanel'
import en from '../i18n/locales/en.json'
import de from '../i18n/locales/de.json'
import es from '../i18n/locales/es.json'

vi.mock('../services/api', () => ({
  getUsers: vi.fn().mockResolvedValue({ data: [] }),
  updateUserRole: vi.fn(),
  deleteUser: vi.fn(),
}))
vi.mock('./MfaSection', () => ({ default: () => null }))

beforeEach(() => localStorage.clear())
afterEach(() => { localStorage.clear(); i18n.changeLanguage('en') })

const renderPanel = () => render(
  <SettingsPanel themeMode="system" onSetThemeMode={vi.fn()} user={null}
                 onLogin={vi.fn()} onLogout={vi.fn()} />,
)

const hrefs = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('.settings-legal a'))
  .map(a => a.getAttribute('href') || '')

describe('legal links in Settings', () => {
  it('are reachable without an account', () => {
    // Signed out is the case that matters: a store reviewer and a person named in
    // the data both arrive without one.
    renderPanel()
    expect(hrefs()).toEqual([
      '/legal/privacy.html', '/legal/imprint.html',
      '/legal/terms.html', '/legal/data-sources.html',
    ])
  })

  it('points at the German pages when the UI is German', async () => {
    await i18n.changeLanguage('de')
    renderPanel()
    expect(hrefs()).toEqual([
      '/legal/privacy.de.html', '/legal/imprint.de.html',
      '/legal/terms.de.html', '/legal/data-sources.de.html',
    ])
  })

  it('falls back to English for a language with no translated pages', async () => {
    // Spanish UI, English documents — a wrong link is worse than a wrong language.
    await i18n.changeLanguage('es')
    renderPanel()
    expect(hrefs().every(h => !h.includes('.de.'))).toBe(true)
    expect(hrefs()[0]).toBe('/legal/privacy.html')
  })

  it('resolves a regional tag like de-AT to the German pages', async () => {
    await i18n.changeLanguage('de-AT')
    renderPanel()
    expect(hrefs()[0]).toBe('/legal/privacy.de.html')
  })

  it('links only to pages that actually exist on disk', () => {
    // The pages are static files, so a typo'd href fails silently in production —
    // the SPA does not route them and the user gets a 404.
    for (const lang of ['en', 'de'] as const) {
      const suffix = lang === 'de' ? '.de' : ''
      for (const name of ['privacy', 'imprint', 'terms', 'data-sources',
                          'delete-account', 'index']) {
        const path = `public/legal/${name}${suffix}.html`
        expect(existsSync(path), `${path} is linked but missing`).toBe(true)
      }
    }
  })

  it('opens in a new tab without leaking the opener', () => {
    renderPanel()
    for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('.settings-legal a'))) {
      expect(a.target).toBe('_blank')
      expect(a.rel).toContain('noreferrer')
    }
  })
})

describe('legal labels', () => {
  it('exist in every language, so no locale shows a raw key', () => {
    const keys = ['legal', 'legalPrivacy', 'legalImprint', 'legalTerms', 'legalSources']
    // The catalogues nest deeper than two levels (report.category.*), so index them
    // loosely rather than claiming a shape they do not have.
    const settings = (cat: unknown) =>
      (cat as { settings?: Record<string, unknown> }).settings ?? {}
    for (const [name, cat] of Object.entries({ en, de, es })) {
      for (const key of keys) {
        expect(settings(cat)[key], `${name}.settings.${key}`).toBeTruthy()
      }
    }
  })
})
