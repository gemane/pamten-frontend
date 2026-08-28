#!/usr/bin/env node
/**
 * Fill the operator's identity into the built legal pages.
 *
 * Austrian law (§5 ECG) requires the *published* imprint to carry a real name and
 * postal address, but this repository is public and git history cannot be
 * un-published. So the sources carry {{OWNER_*}} tokens and the real values are
 * injected here, at build time, from environment variables set on the host.
 *
 *   LEGAL_NAME     e.g. "Jane Example"
 *   LEGAL_ADDRESS  e.g. "Examplegasse 1, 1010 Vienna"   (\n allowed for line breaks)
 *   LEGAL_EMAIL    e.g. "legal@example.com"
 *
 * In a production build a missing value is a hard error. A live imprint reading
 * "{{OWNER_ADDRESS}}" would be worse than having no imprint at all: it is both an
 * ECG breach and visibly broken. Locally the tokens fall back to obvious
 * placeholders so `npm run dev` and the test suite work without any setup.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'dist/legal'
const PRODUCTION = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'

const FIELDS = {
  OWNER_NAME: { env: 'LEGAL_NAME', dev: '[OWNER NAME — set LEGAL_NAME]' },
  OWNER_ADDRESS: { env: 'LEGAL_ADDRESS', dev: '[OWNER ADDRESS — set LEGAL_ADDRESS]' },
  OWNER_EMAIL: { env: 'LEGAL_EMAIL', dev: 'legal@example.com' },
}

const missing = []
const values = {}
for (const [token, { env, dev }] of Object.entries(FIELDS)) {
  const value = (process.env[env] || '').trim()
  if (value) values[token] = value
  else { missing.push(env); values[token] = dev }
}

if (missing.length && PRODUCTION) {
  console.error(
    `\nfill-legal: refusing to build.\n` +
    `  Missing: ${missing.join(', ')}\n` +
    `  These are published on /legal/imprint.html to satisfy §5 ECG. Shipping the\n` +
    `  placeholder text instead would be both unlawful and visibly broken.\n` +
    `  Set them in the Render environment, then redeploy.\n`)
  process.exit(1)
}
if (missing.length) console.warn(`fill-legal: using dev placeholders for ${missing.join(', ')}`)

let files = []
try {
  files = readdirSync(DIR).filter(f => f.endsWith('.html'))
} catch {
  console.error(`fill-legal: ${DIR} not found — run after \`vite build\``)
  process.exit(1)
}

let replaced = 0
for (const file of files) {
  const path = join(DIR, file)
  let html = readFileSync(path, 'utf8')
  for (const [token, value] of Object.entries(values)) {
    // The address may be multi-line; HTML needs <br> rather than a newline.
    const rendered = token === 'OWNER_ADDRESS' ? value.split(/\\n|\n/).join('<br>') : value
    html = html.split(`{{${token}}}`).join(rendered)
  }
  writeFileSync(path, html)
  replaced++
}

const leftover = files.filter(f => readFileSync(join(DIR, f), 'utf8').includes('{{'))
if (leftover.length) {
  console.error(`fill-legal: unsubstituted {{tokens}} remain in ${leftover.join(', ')}`)
  process.exit(1)
}

console.log(`fill-legal: ${replaced} page(s) filled${missing.length ? ' (dev placeholders)' : ''}`)
