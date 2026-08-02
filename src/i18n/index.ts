import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import de from './locales/de.json'
import es from './locales/es.json'
import { systemLanguage } from '../utils/systemLanguage'

// "system" (or nothing saved) → follow the browser's language; else the saved code.
const saved = localStorage.getItem('lang')
const lng = !saved || saved === 'system' ? systemLanguage() : saved

i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, de: { translation: de }, es: { translation: es } },
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

export default i18n
