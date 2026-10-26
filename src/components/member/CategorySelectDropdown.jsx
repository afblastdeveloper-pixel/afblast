import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, ChevronDown, Check, AlertCircle, X, Layers } from 'lucide-react'

export default function CategorySelectDropdown({
  categories = [],
  selectedCategoryId,
  onSelectCategory,
  disabled = false,
}) {
  const { t, i18n } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef(null)
  const isRTL = i18n.language === 'ar'

  const selectedCategory = useMemo(() => {
    return categories.find((c) => String(c.id) === String(selectedCategoryId)) || null
  }, [categories, selectedCategoryId])

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories
    const q = search.toLowerCase()
    return categories.filter((c) => (c.name || '').toLowerCase().includes(q))
  }, [categories, search])

  // Close desktop dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Format currency
  const formatRate = (rate) => {
    return new Intl.NumberFormat(i18n.language || 'id-ID').format(rate || 0)
  }

  const formatNumber = (num) => {
    return new Intl.NumberFormat(i18n.language || 'id-ID').format(num || 0)
  }

  const handleSelect = (category) => {
    if (!category.hasActiveCampaign || category.remaining <= 0) return
    onSelectCategory(category.id)
    setIsOpen(false)
    setSearch('')
  }

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={[
          'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-start transition-all',
          'border bg-white dark:bg-slate-900',
          disabled
            ? 'opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-800'
            : isOpen
            ? 'border-primary shadow-md ring-2 ring-primary/20 dark:border-primary-light'
            : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700 shadow-2xs',
        ].join(' ')}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-primary dark:text-blue-400 flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            {selectedCategory ? (
              <>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                  {selectedCategory.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Rp {formatRate(selectedCategory.ratePerMessage)}/pesan • {formatNumber(selectedCategory.remaining)} {t('memberWhatsapp.activeContacts', 'kontak')}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">
                  {t('memberWhatsapp.selectCategory', 'Pilih Kategori Target')}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {categories.length} {t('memberWhatsapp.targetCategory', 'Kategori Tersedia')}
                </p>
              </>
            )}
          </div>
        </div>
        <ChevronDown
          className={[
            'w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200',
            isOpen ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>

      {/* DESKTOP POPOVER (>= 640px) */}
      {isOpen && (
        <>
          <div className="hidden sm:block absolute top-full mt-2 left-0 right-0 z-50 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Search Input */}
            <div className="relative mb-2 px-2 pt-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('memberWhatsapp.searchCategory', 'Cari kategori...')}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                autoFocus
              />
            </div>

            {/* List */}
            <div className="max-h-64 overflow-y-auto space-y-1 px-1">
              {filteredCategories.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  {t('common.noData', 'Kategori tidak ditemukan')}
                </div>
              ) : (
                filteredCategories.map((c) => {
                  const isSelected = String(c.id) === String(selectedCategoryId)
                  const isDisabled = !c.hasActiveCampaign || c.remaining <= 0

                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => handleSelect(c)}
                      className={[
                        'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-start transition-colors',
                        isSelected
                          ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light font-bold'
                          : isDisabled
                          ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-slate-600'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200',
                      ].join(' ')}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{c.name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Rp {formatRate(c.ratePerMessage)}/pesan • {formatNumber(c.remaining)} {t('memberWhatsapp.activeContacts', 'kontak')}
                        </p>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {!c.hasActiveCampaign ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-medium">
                            {t('memberWhatsapp.noActiveCampaign', 'Tidak ada kampanye aktif')}
                          </span>
                        ) : c.remaining <= 0 ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 font-medium">
                            {t('memberWhatsapp.noRemainingContacts', 'Sisa kontak habis')}
                          </span>
                        ) : isSelected ? (
                          <Check className="w-4 h-4 text-primary" />
                        ) : null}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* MOBILE BOTTOM SHEET (< 640px) */}
          <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div
              className="bg-white dark:bg-slate-900 rounded-t-3xl p-5 shadow-2xl border-t border-slate-200 dark:border-slate-800 max-h-[80vh] flex flex-col animate-in slide-in-from-bottom duration-250"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-primary flex items-center justify-center">
                    <Layers className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {t('memberWhatsapp.targetCategory', 'KATEGORI TARGET')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search */}
              <div className="relative mt-3 mb-2">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('memberWhatsapp.searchCategory', 'Cari kategori...')}
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden"
                />
              </div>

              {/* List */}
              <div className="overflow-y-auto space-y-1.5 pt-2 flex-1">
                {filteredCategories.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">
                    {t('common.noData', 'Kategori tidak ditemukan')}
                  </p>
                ) : (
                  filteredCategories.map((c) => {
                    const isSelected = String(c.id) === String(selectedCategoryId)
                    const isDisabled = !c.hasActiveCampaign || c.remaining <= 0

                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => handleSelect(c)}
                        className={[
                          'w-full flex items-center justify-between gap-3 p-3 rounded-xl text-start transition-colors',
                          isSelected
                            ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-light font-bold'
                            : isDisabled
                            ? 'opacity-40 cursor-not-allowed text-slate-400'
                            : 'active:bg-slate-100 dark:active:bg-slate-800 text-slate-800 dark:text-slate-200',
                        ].join(' ')}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{c.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Rp {formatRate(c.ratePerMessage)}/pesan • {formatNumber(c.remaining)} {t('memberWhatsapp.activeContacts', 'kontak')}
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          {!c.hasActiveCampaign ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              {t('memberWhatsapp.noActiveCampaign', 'Tidak ada kampanye aktif')}
                            </span>
                          ) : c.remaining <= 0 ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                              {t('memberWhatsapp.noRemainingContacts', 'Sisa kontak habis')}
                            </span>
                          ) : isSelected ? (
                            <Check className="w-5 h-5 text-primary" />
                          ) : null}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
