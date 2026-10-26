import { useTranslation } from 'react-i18next'
import { Send } from 'lucide-react'

export default function CampaignListPage() {
  const { t } = useTranslation()
  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
          <Send className="w-5 h-5 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{t('pages.campaigns')}</h1>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
        <Send className="w-12 h-12 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">{t('pages.comingSoon')}</p>
      </div>
    </div>
  )
}
