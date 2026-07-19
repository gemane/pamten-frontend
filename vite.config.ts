/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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
    "img-src 'self' data: https://commons.wikimedia.org https://upload.wikimedia.org",
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || 'https://pamten-backend-yrbh.onrender.com'

  return {
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
    plugins: [react(), cspPlugin(apiUrl)],
    build: {
      // Keep legacy media-query syntax (`max-width: 640px`). Without an older
      // target the CSS minifier rewrites it to the range form `(width <= 640px)`,
      // which iOS Safari < 16.4 doesn't understand — so those media queries were
      // silently dropped on older phones.
      cssTarget: ['chrome87', 'safari14', 'firefox78', 'edge88'],
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
