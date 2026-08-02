// The app's supported UI languages, in the order shown in Settings.
export const SUPPORTED_LANGS = ['en', 'de', 'es'] as const
export type Lang = (typeof SUPPORTED_LANGS)[number]

/** Pick a supported UI language from the browser's language preferences (e.g. an
 * `'de-AT'` preference → `'de'`), falling back to English. Pure/injectable for tests. */
export function systemLanguage(
  navLangs: readonly string[] = typeof navigator !== 'undefined'
    ? (navigator.languages?.length ? navigator.languages : [navigator.language])
    : [],
): Lang {
  for (const l of navLangs) {
    const base = (l || '').slice(0, 2).toLowerCase() as Lang
    if ((SUPPORTED_LANGS as readonly string[]).includes(base)) return base
  }
  return 'en'
}
