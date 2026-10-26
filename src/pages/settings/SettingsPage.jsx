import { useTranslation } from 'react-i18next'
import { Settings } from 'lucide-react'

export default function SettingsPage() {
  const { t } = useTranslation()
  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
          <Settings className="w-5 h-5 text-gray-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{t('pages.settings')}</h1>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
        <Settings className="w-12 h-12 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">{t('pages.comingSoon')}</p>
      </div>
    </div>
  )
}
