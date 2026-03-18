'use client'

import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Column<T extends Record<string, unknown>> {
  key: string
  label: string
  sortable?: boolean
  render?: (row: T) => React.ReactNode
}

export interface FilterConfig {
  key: string
  label: string
  options: { label: string; value: string }[]
}

interface SortableTableProps<T extends Record<string, unknown>> {
  columns:    Column<T>[]
  data:       T[]
  searchKeys?: string[]
  searchPlaceholder?: string
  filters?:   FilterConfig[]
  onRowClick?: (row: T) => void
  emptyMessage?: string
  loading?: boolean
}

type SortDir = 'asc' | 'desc'

// ── Helper ─────────────────────────────────────────────────────────────────────

function getVal(row: Record<string, unknown>, key: string): unknown {
  if (key.includes('.')) {
    const [head, ...rest] = key.split('.')
    const sub = row[head]
    if (sub && typeof sub === 'object') return getVal(sub as Record<string, unknown>, rest.join('.'))
    return undefined
  }
  return row[key]
}

function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  const mult = dir === 'asc' ? 1 : -1
  if (a === null || a === undefined) return mult
  if (b === null || b === undefined) return -mult
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * mult
  const sa = String(a).toLowerCase()
  const sb = String(b).toLowerCase()
  return sa.localeCompare(sb) * mult
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SortableTable<T extends Record<string, unknown>>({
  columns,
  data,
  searchKeys = [],
  searchPlaceholder = 'Search…',
  filters = [],
  onRowClick,
  emptyMessage = 'No results found.',
  loading = false,
}: SortableTableProps<T>) {
  const [search,    setSearch]    = useState('')
  const [sortKey,   setSortKey]   = useState<string | null>(null)
  const [sortDir,   setSortDir]   = useState<SortDir>('asc')
  const [filterVals, setFilterVals] = useState<Record<string, string>>({})

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function setFilter(key: string, value: string) {
    setFilterVals(prev => ({ ...prev, [key]: value }))
  }

  const processed = useMemo(() => {
    let list = [...data]

    // Search
    if (search.trim() && searchKeys.length > 0) {
      const q = search.trim().toLowerCase()
      list = list.filter(row =>
        searchKeys.some(k => {
          const v = getVal(row, k)
          return v !== null && v !== undefined && String(v).toLowerCase().includes(q)
        })
      )
    }

    // Filters
    for (const f of filters) {
      const chosen = filterVals[f.key]
      if (chosen && chosen !== 'all') {
        list = list.filter(row => {
          const v = getVal(row, f.key)
          return String(v ?? '') === chosen
        })
      }
    }

    // Sort
    if (sortKey) {
      list = [...list].sort((a, b) =>
        compareValues(getVal(a, sortKey), getVal(b, sortKey), sortDir)
      )
    }

    return list
  }, [data, search, searchKeys, filterVals, filters, sortKey, sortDir])

  return (
    <div className="space-y-3">
      {/* Controls */}
      {(searchKeys.length > 0 || filters.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          {filters.map(f => (
            <select
              key={f.key}
              value={filterVals[f.key] ?? 'all'}
              onChange={e => setFilter(f.key, e.target.value)}
              className="h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="all">All {f.label}</option>
              {f.options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ))}
          {searchKeys.length > 0 && (
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-64 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          )}
          <span className="ml-auto text-xs text-zinc-500">
            {processed.length !== data.length
              ? `Showing ${processed.length} of ${data.length}`
              : `${data.length} total`}
          </span>
        </div>
      )}

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wide">
                {columns.map(col => (
                  <th key={col.key} className="px-5 py-3 text-left whitespace-nowrap">
                    {col.sortable ? (
                      <button
                        onClick={() => handleSort(col.key)}
                        className="flex items-center gap-1 hover:text-zinc-300 transition-colors"
                      >
                        {col.label}
                        {sortKey === col.key ? (
                          sortDir === 'asc'
                            ? <ChevronUp className="h-3 w-3" />
                            : <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {loading && (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-8 text-center text-zinc-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && processed.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-5 py-8 text-center text-zinc-500">
                    {emptyMessage}
                  </td>
                </tr>
              )}
              {!loading && processed.map((row, i) => (
                <tr
                  key={i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`hover:bg-zinc-800/40 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {columns.map(col => (
                    <td key={col.key} className="px-5 py-3">
                      {col.render
                        ? col.render(row)
                        : <span className="text-zinc-300">{String(getVal(row, col.key) ?? '—')}</span>
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
