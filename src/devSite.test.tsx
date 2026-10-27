/**
 * The dev-site marking: a strip on every page of dev.owlgraph.org, a "DEV · "
 * tab title and a noindex — and none of it in any other build. The HTML half
 * (devSiteHtmlPlugin) is tested in scripts/dev-site.test.ts, beside vite.config.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import i18n from './i18n'
import DevBanner from './components/DevBanner'

describe('the banner gate', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

  it('is closed without VITE_DEPLOY_ENV', async () => {
    vi.stubEnv('VITE_DEPLOY_ENV', '')
    vi.resetModules()
    expect((await import('./devSite')).DevBanner).toBeNull()
  })

  it.each(['production', 'Development', 'dev'])('is closed for %s', async (value) => {
    vi.stubEnv('VITE_DEPLOY_ENV', value)
    vi.resetModules()
    expect((await import('./devSite')).DevBanner).toBeNull()
  })

  it('opens for development and renders the strip', async () => {
    vi.stubEnv('VITE_DEPLOY_ENV', 'development')
    vi.resetModules()
    const Lazy = (await import('./devSite')).DevBanner
    expect(Lazy).not.toBeNull()
    render(<Suspense fallback={null}>{Lazy && <Lazy />}</Suspense>)
    expect(await screen.findByRole('note')).toHaveTextContent(/Development site/)
  })
})

describe('DevBanner', () => {
  afterEach(() => i18n.changeLanguage('en'))

  it('says the data may be dropped', async () => {
    await i18n.changeLanguage('en')
    render(<DevBanner />)
    expect(screen.getByRole('note')).toHaveTextContent(
      'Development site: test data, may be reset or deleted at any time')
  })

  it('has a short line for a phone', async () => {
    await i18n.changeLanguage('en')
    const { container } = render(<DevBanner />)
    expect(container.querySelector('.dev-banner__short'))
      .toHaveTextContent('Dev site: data may be deleted at any time')
  })

  it('speaks the UI language', async () => {
    await i18n.changeLanguage('de')
    render(<DevBanner />)
    expect(screen.getByRole('note')).toHaveTextContent(/^⚠ Entwicklungsseite: Testdaten/)
  })

  it('has no close button', () => {
    render(<DevBanner />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
