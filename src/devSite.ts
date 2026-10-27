import { lazy } from 'react'

/**
 * The "development site" strip, or null.
 *
 * Only the dev deploy (the Render static site behind dev.owlgraph.org) builds
 * with `VITE_DEPLOY_ENV=development`. Vite writes the value into the code at
 * build time, so in any other build the condition is the constant `false`: the
 * minifier drops the branch and the dynamic import with it, and the banner's
 * component, text and CSS never become part of the bundle — the production
 * release carries nothing of it. The static half (title prefix, noindex) is
 * `devSiteHtmlPlugin` in vite.config.ts.
 */
export const DevBanner = import.meta.env.VITE_DEPLOY_ENV === 'development'
  ? lazy(() => import('./components/DevBanner'))
  : null
