import { useTranslation } from 'react-i18next'
import './DevBanner.css'

// The text lives here, not in the locale files: those ship in every build, and
// the production bundle is meant to carry nothing of the dev marking.
const TEXT: Record<string, { long: string; short: string }> = {
  en: { long: 'Development site: test data, may be reset or deleted at any time',
        short: 'Dev site: data may be deleted at any time' },
  de: { long: 'Entwicklungsseite: Testdaten, können jederzeit zurückgesetzt oder gelöscht werden',
        short: 'Dev-Seite: Daten können jederzeit gelöscht werden' },
  es: { long: 'Sitio de desarrollo: datos de prueba, pueden restablecerse o borrarse en cualquier momento',
        short: 'Sitio de desarrollo: los datos pueden borrarse' },
}

/** A thin amber strip over every page of the dev site. Not dismissable on purpose. */
export default function DevBanner() {
  const { i18n } = useTranslation()
  const lang = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2)
  const text = TEXT[lang] ?? TEXT.en
  return (
    <div className="dev-banner" role="note">
      <span aria-hidden="true">⚠</span>{' '}
      {/* the long line is cut off on a phone; the CSS shows one of the two, and
          display: none keeps the other from screen readers too */}
      <span className="dev-banner__long">{text.long}</span>
      <span className="dev-banner__short">{text.short}</span>
    </div>
  )
}
