/**
 * Tabs.jsx – Komponen navigasi Tab Reusable dengan Count Badge
 * Menggunakan design tokens AF Blast (Light & Dark mode).
 *
 * @param {Array<{ key: string, label: string, count?: number, icon?: React.ComponentType }>} tabs
 * @param {string} activeTab
 * @param {function(string): void} onChange
 * @param {string} className
 */
export default function Tabs({
  tabs = [],
  activeTab,
  onChange,
  className = '',
}) {
  return (
    <div
      className={`border-b border-border overflow-x-auto scrollbar-none ${className}`}
      role="tablist"
    >
      <nav className="flex space-x-2 sm:space-x-3 min-w-max pb-px" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key
          const Icon = tab.icon

          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.key)}
              className={[
                'flex items-center gap-2 py-2.5 px-3.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap',
                isActive
                  ? 'border-primary text-primary-text bg-primary-soft rounded-t-xl font-bold shadow-2xs'
                  : 'border-transparent text-muted hover:text-text hover:border-border',
              ].join(' ')}
            >
              {Icon && (
                <Icon
                  className={`w-3.5 h-3.5 ${
                    isActive ? 'text-primary-text' : 'text-muted'
                  }`}
                />
              )}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold tabular-nums transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'bg-surface-2 text-muted border border-border'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
