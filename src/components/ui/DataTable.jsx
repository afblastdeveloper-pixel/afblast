import { useState, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
} from 'lucide-react'
import EmptyState from './EmptyState'

/**
 * DataTable.jsx – Tabel data universal responsif & interaktif
 * Menggunakan design tokens AF Blast (Light & Dark mode).
 *
 * @param {Array<{ key: string, label: string, sortable?: boolean, render?: (val, row) => React.ReactNode, align?: 'start'|'center'|'end', className?: string }>} columns
 * @param {Array<object>} data
 * @param {string} searchPlaceholder
 * @param {number} pageSize - default 8
 * @param {boolean} loading - tampilkan skeleton saat loading
 * @param {function(row): void} onRowClick
 * @param {React.ReactNode} actions - Slot tombol tambahan di header bar (e.g. Export, Add)
 * @param {React.ReactNode} filters - Slot filter tambahan (e.g. status dropdown)
 * @param {string} emptyTitle
 * @param {string} emptyDescription
 */
export default function DataTable({
  columns = [],
  data = [],
  searchPlaceholder = 'Cari data...',
  pageSize = 8,
  loading = false,
  onRowClick,
  actions,
  filters,
  emptyTitle = 'Data Tidak Ditemukan',
  emptyDescription = 'Tidak ada baris data yang cocok dengan kriteria pencarian.',
}) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('')
  const [sortDirection, setSortDirection] = useState('asc') // 'asc' | 'desc'
  const [currentPage, setCurrentPage] = useState(1)

  // Handle Sort
  const handleSort = (key) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else {
        setSortKey('')
        setSortDirection('asc')
      }
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  // Filter Search
  const filteredData = useMemo(() => {
    if (!search.trim()) return data
    const query = search.trim().toLowerCase()
    return data.filter((row) =>
      Object.values(row).some((val) => {
        if (val === null || val === undefined) return false
        return String(val).toLowerCase().includes(query)
      })
    )
  }, [data, search])

  // Sorted Data
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (aVal === bVal) return 0
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      return sortDirection === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
    })
  }, [filteredData, sortKey, sortDirection])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedData = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return sortedData.slice(start, start + pageSize)
  }, [sortedData, safePage, pageSize])

  return (
    <div className="bg-surface rounded-2xl border border-border shadow-2xs overflow-hidden">
      {/* Header bar: Search & Actions */}
      <div className="p-4 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-muted absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setCurrentPage(1)
              }}
              placeholder={searchPlaceholder}
              className="w-full h-10 ps-9 pe-4 text-xs bg-surface-2 border border-border rounded-xl focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-text placeholder-muted"
            />
          </div>
          {filters}
        </div>

        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>

      {/* Loading Skeleton State */}
      {loading ? (
        <div className="p-4 space-y-3 animate-pulse">
          <div className="h-9 bg-surface-2 rounded-xl w-full" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-surface-2/60 rounded-xl w-full" />
          ))}
        </div>
      ) : paginatedData.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          className="border-none rounded-none py-14"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start border-collapse" role="table">
            <thead>
              <tr className="sticky top-0 bg-surface-2/95 backdrop-blur-xs text-muted text-[11px] font-bold uppercase tracking-wider border-b border-border select-none z-10">
                {columns.map((col) => {
                  const alignClass = {
                    start: 'text-start',
                    center: 'text-center',
                    end: 'text-end',
                  }[col.align || 'start']

                  const isSorted = sortKey === col.key

                  return (
                    <th
                      key={col.key}
                      className={`px-5 py-3.5 font-bold ${alignClass} ${col.className || ''}`}
                    >
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => handleSort(col.key)}
                          className="inline-flex items-center gap-1.5 hover:text-text transition-colors focus:outline-hidden font-bold uppercase tracking-wider text-[11px]"
                        >
                          <span>{col.label}</span>
                          {isSorted ? (
                            sortDirection === 'asc' ? (
                              <ChevronUp className="w-3.5 h-3.5 text-primary-text" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-primary-text" />
                            )
                          ) : (
                            <ChevronsUpDown className="w-3.5 h-3.5 text-muted/60" />
                          )}
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedData.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  onClick={() => onRowClick?.(row)}
                  className={[
                    'hover:bg-surface-2/60 transition-colors',
                    onRowClick ? 'cursor-pointer' : '',
                  ].join(' ')}
                >
                  {columns.map((col) => {
                    const alignClass = {
                      start: 'text-start',
                      center: 'text-center',
                      end: 'text-end',
                    }[col.align || 'start']

                    const content = col.render
                      ? col.render(row[col.key], row)
                      : row[col.key]

                    return (
                      <td
                        key={col.key}
                        className={`px-5 py-3.5 ${alignClass} text-text ${col.className || ''}`}
                      >
                        {content}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      <div className="px-5 py-3.5 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted bg-surface">
        <div>
          Menampilkan{' '}
          <span className="font-semibold text-text">
            {sortedData.length > 0 ? (safePage - 1) * pageSize + 1 : 0}
          </span>{' '}
          -{' '}
          <span className="font-semibold text-text">
            {Math.min(safePage * pageSize, sortedData.length)}
          </span>{' '}
          dari{' '}
          <span className="font-semibold text-text">
            {sortedData.length}
          </span>{' '}
          data
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="p-1.5 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="px-3 py-1 text-xs font-semibold text-text">
            {safePage} / {totalPages}
          </span>

          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="p-1.5 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Halaman berikutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
