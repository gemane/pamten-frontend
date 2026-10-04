/**
 * Which of a company's names to show first — its legal name, or the Latin
 * one the register keeps beside it.
 *
 * A Korean subsidiary is registered as 네슬레코리아 유한책임회사, and GLEIF
 * keeps "Nestle Korea" beside it (the importer stores the register's other
 * names as `other_names`). Neither is right for everybody: a reader of Hangul
 * wants the legal name, everybody else the one they can read. So the order
 * follows the VIEWER — the browser's languages, not the app's (there is no
 * Korean UI; a Korean visitor reads the English one with `ko` in the
 * browser's list) — and the name's script, judged from its characters, so it
 * works for any source.
 *
 * Nothing is translated or romanised here: only names a source states are
 * shown. A name without a Latin counterpart stays as it is for everyone —
 * the place a local romanisation would plug in once sources from non-Latin
 * countries bring many of those.
 */

/** The scripts we tell apart. Japanese is its own: kana with or without Han. */
export type Script =
  | 'Latin' | 'Hangul' | 'Japanese' | 'Han' | 'Thai' | 'Cyrillic' | 'Greek'
  | 'Arabic' | 'Hebrew' | 'Devanagari' | 'Georgian' | 'Armenian' | 'Other'

const SCRIPT_TESTS: [Exclude<Script, 'Japanese' | 'Other'>, RegExp][] = [
  ['Latin', /\p{Script=Latin}/u],
  ['Hangul', /\p{Script=Hangul}/u],
  ['Han', /\p{Script=Han}/u],
  ['Thai', /\p{Script=Thai}/u],
  ['Cyrillic', /\p{Script=Cyrillic}/u],
  ['Greek', /\p{Script=Greek}/u],
  ['Arabic', /\p{Script=Arabic}/u],
  ['Hebrew', /\p{Script=Hebrew}/u],
  ['Devanagari', /\p{Script=Devanagari}/u],
  ['Georgian', /\p{Script=Georgian}/u],
  ['Armenian', /\p{Script=Armenian}/u],
]
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u
const LETTER = /\p{L}/u

/** The script most of the name's letters are in (digits, spaces,
 *  punctuation and marks do not count); null for a name without letters. */
export function scriptOf(text: string): Script | null {
  const counts = new Map<Script, number>()
  let kana = false
  for (const ch of text) {
    if (!LETTER.test(ch)) continue
    if (KANA.test(ch)) { kana = true; counts.set('Japanese', (counts.get('Japanese') ?? 0) + 1); continue }
    const hit = SCRIPT_TESTS.find(([, re]) => re.test(ch))
    const s: Script = hit ? hit[0] : 'Other'
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  // Han beside kana is Japanese: one name, one reader.
  if (kana && counts.has('Han')) {
    counts.set('Japanese', (counts.get('Japanese') ?? 0) + counts.get('Han')!)
    counts.delete('Han')
  }
  let best: Script | null = null, most = 0
  for (const [s, n] of counts) if (n > most) { best = s; most = n }
  return best
}

/** Every letter Latin — "NESTLE (THAI) LIMITED", "Nestlé Türkiye", not a
 *  name that only quotes a Latin brand inside Thai. */
export function isLatin(text: string): boolean {
  let letters = 0
  for (const ch of text) {
    if (!LETTER.test(ch)) continue
    if (!/\p{Script=Latin}/u.test(ch)) return false
    letters++
  }
  return letters > 0
}

/** Which scripts a reader of these languages reads (BCP 47 tags as the
 *  browser lists them). Latin is not listed: it is the fallback anyway. */
const SCRIPTS_BY_LANGUAGE: Record<string, Script[]> = {
  ko: ['Hangul', 'Han'],
  ja: ['Japanese', 'Han'],
  zh: ['Han'], yue: ['Han'],
  th: ['Thai'],
  ru: ['Cyrillic'], uk: ['Cyrillic'], bg: ['Cyrillic'], sr: ['Cyrillic'], be: ['Cyrillic'],
  mk: ['Cyrillic'], kk: ['Cyrillic'], ky: ['Cyrillic'], mn: ['Cyrillic'], tg: ['Cyrillic'],
  el: ['Greek'],
  ar: ['Arabic'], fa: ['Arabic'], ur: ['Arabic'], ps: ['Arabic'],
  he: ['Hebrew'], yi: ['Hebrew'],
  hi: ['Devanagari'], mr: ['Devanagari'], ne: ['Devanagari'],
  ka: ['Georgian'], hy: ['Armenian'],
}

export function readerScripts(languages: readonly string[]): Set<Script> {
  const out = new Set<Script>()
  for (const tag of languages) {
    const lang = tag.toLowerCase().split(/[-_]/)[0]
    for (const s of SCRIPTS_BY_LANGUAGE[lang] ?? []) out.add(s)
  }
  return out
}

let viewer: Set<Script> | null = null
/** The scripts this browser's user reads — read once. */
export function viewerScripts(): Set<Script> {
  if (!viewer) {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    viewer = readerScripts(nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [])
  }
  return viewer
}
/** Tests: pretend to be a reader of these languages (null: read the browser again). */
export function setViewerLanguages(languages: readonly string[] | null): void {
  viewer = languages ? readerScripts(languages) : null
}

type Named = { name?: string | null; other_names?: readonly string[] | null }

/** The register's Latin name for a company whose legal name is not Latin. */
export function latinName(e: Named): string | null {
  const name = e.name ?? ''
  if (!name || isLatin(name)) return null
  return e.other_names?.find(n => !!n && isLatin(n)) ?? null
}

export interface DisplayName {
  /** shown first — the graph's box, the list's row, the panel's title */
  primary: string
  /** the other one, where there is one — under the title, on hover */
  secondary: string | null
  /** which of the two `secondary` is */
  secondaryKind: 'legal' | 'latin' | null
}

/** The names in the viewer's order: the legal name first for a reader of its
 *  script (or when there is no Latin one), else the Latin one. */
export function displayName(e: Named, scripts: Set<Script> = viewerScripts()): DisplayName {
  const name = e.name ?? ''
  const latin = latinName(e)
  if (!latin) return { primary: name, secondary: null, secondaryKind: null }
  const script = scriptOf(name)
  return script && scripts.has(script)
    ? { primary: name, secondary: latin, secondaryKind: 'latin' }
    : { primary: latin, secondary: name, secondaryKind: 'legal' }
}

/** The name to show for a company, where there is room for one. */
export const entityLabel = (e: Named): string => displayName(e).primary
