import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { SUPPORTED_LANGUAGES, LS_LANG_KEY } from '../utils/constants'

// Import semua file terjemahan
import en from './locales/en.json'
import id from './locales/id.json'
import zh from './locales/zh.json'
import ar from './locales/ar.json'
import th from './locales/th.json'
import fil from './locales/fil.json'

// Deteksi bahasa awal: localStorage → browser language → 'id'
function detectInitialLanguage() {
  try {
    const stored = localStorage.getItem(LS_LANG_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      const supported = SUPPORTED_LANGUAGES.map(l => l.code)
      if (supported.includes(parsed)) return parsed
    }
  } catch {
    // Abaikan error parsing
  }

  // Coba bahasa browser
  const browserLang = navigator.language?.split('-')[0]
  const supported = SUPPORTED_LANGUAGES.map(l => l.code)
  if (browserLang && supported.includes(browserLang)) return browserLang

  return 'id' // fallback default
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      id: { translation: id },
      zh: { translation: zh },
      ar: { translation: ar },
      th: { translation: th },
      fil: { translation: fil },
    },
    lng: detectInitialLanguage(),
    fallbackLng: 'id',
    interpolation: {
      escapeValue: false, // React sudah aman dari XSS
    },
  })

export default i18n
