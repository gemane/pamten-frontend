/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-expect-error — a plain .mjs script, shared with the Android build (no types)
import { resolveAppVersion } from './scripts/app-version.mjs'

// Inject a strict Content-Security-Policy meta tag into the production build.
// Kept out of the dev server so Vite's HMR (eval + websocket) keeps working.
// The sha256 hash pins the inline theme script in index.html — regenerate it
// (openssl or the build's dist/index.html) if that script ever changes.
function cspPlugin(apiUrl: string): Plugin {
  let apiOrigin = ''
  try { apiOrigin = new URL(apiUrl).origin } catch { /* leave empty on bad URL */ }

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'sha256-1o6eNdK+q27XKvFZMKWcidtwJHWnJ/s0krkPzTlmgnM='",
    "style-src 'self' 'unsafe-inline'",
    // commons/upload.wikimedia = entity logos; *.basemaps.cartocdn.com = detail-map tiles
    // commons/upload = entity logos (Wikidata P154/P18); thumb.wikimedia.org = the
    // host Wikipedia's summary API now serves person thumbnails from (it moved
    // off upload.wikimedia.org in 2026 and every person photo went blank until
    // this line caught up); *.basemaps.cartocdn.com = detail-map tiles
    "img-src 'self' data: https://commons.wikimedia.org https://upload.wikimedia.org https://thumb.wikimedia.org https://*.basemaps.cartocdn.com",
    `connect-src 'self'${apiOrigin ? ' ' + apiOrigin : ''} https://www.wikidata.org https://en.wikipedia.org`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '</title>',
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`,
      )
    },
  }
}

/**
 * Writes the build's version into index.html as `<meta name="app-version">`, so
 * what is deployed can be read without opening the app (`curl -s <site> | grep
 * app-version`), and the release workflow can check the number made it in.
 */
export function versionMetaPlugin(version: string): Plugin {
  return {
    name: 'owlgraph-version-meta',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'app-version', content: version },
                                injectTo: 'head' }],
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Fallback is the canonical host, not the Render default (pamten-backend-yrbh
  // .onrender.com): both serve the same service, but only the owlgraph.org names
  // are the ones the deployed frontend and the docs use, and this value goes
  // into the page's CSP connect-src.
  const apiUrl = env.VITE_API_URL || 'https://api-dev.owlgraph.org'
  const appVersion: string = resolveAppVersion({ ...process.env, ...env })

  return {
    test: {
      // jsdom so component render tests (@testing-library/react) have a DOM; the pure-logic
      // *.test.ts suites run fine under it too. `globals` enables RTL's afterEach cleanup +
      // jest-dom matchers without importing them per file.
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      // A deterministic feedback address for the suite: CI has no .env, and
      // the real address lives only in the Render build env — the tests pin
      // behaviour against this reserved-domain example.
      env: { VITE_FEEDBACK_EMAIL: 'feedback@example.com' },
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    },
    plugins: [react(), cspPlugin(apiUrl), versionMetaPlugin(appVersion)],
    // The product version, from the release tag (scripts/app-version.mjs).
    define: { __APP_VERSION__: JSON.stringify(appVersion) },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // Function form (rolldown, vite 8+, only supports this — not the
          // object map). Splits the heavy deps into stable, cacheable chunks.
          manualChunks(id) {
            if (!id.includes('/node_modules/')) return
            if (id.includes('/node_modules/cytoscape')) return 'cytoscape'
            if (id.includes('/node_modules/react-icons/')) return 'icons'
            if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'vendor'
          },
        },
      },
    },
  }
})
