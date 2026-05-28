'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import api, { TENANT_ID } from '@/lib/api'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const EVENT_DOT: Record<string, string> = {
  'batch.completed': 'bg-green-500',
  'batch.parsed':    'bg-blue-500',
  'row.normalized':  'bg-gray-400',
  'row.flagged':     'bg-amber-500',
  'row.approved':    'bg-green-500',
  'row.rejected':    'bg-red-500',
  'row.deleted':     'bg-red-500',
  'row.skipped':     'bg-gray-300',
}

const EVENT_FILTERS = [
  { label: 'All',            value: '' },
  { label: 'batch.*',        value: 'batch' },
  { label: 'row.normalized', value: 'row.normalized' },
  { label: 'row.flagged',    value: 'row.flagged' },
  { label: 'row.approved',   value: 'row.approved' },
  { label: 'row.rejected',   value: 'row.rejected' },
]

const PAGE_SIZE = 20

export default function Audit() {
  const [page,        setPage]        = useState(1)
  const [eventFilter, setEventFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['audit', page, eventFilter],
    queryFn: () => {
      const p = new URLSearchParams({
        tenant:    TENANT_ID,
        page:      String(page),
        page_size: String(PAGE_SIZE),
      })
      if (eventFilter) {
        // "batch" prefix filter — backend supports exact match; we handle client-side for prefix
        // Pass event param for exact matches, leave empty for prefix (handled below)
        if (!eventFilter.endsWith('.*') && eventFilter !== 'batch') {
          p.set('event', eventFilter)
        }
      }
      return api.get(`/audit/?${p}`).then(r => r.data)
    },
  })

  // Client-side prefix filter for "batch.*"
  const logs: any[] = (data?.results ?? []).filter((log: any) => {
    if (!eventFilter) return true
    if (eventFilter === 'batch') return log.event?.startsWith('batch.')
    return log.event === eventFilter
  })

  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Audit timeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Immutable event log · {totalCount.toLocaleString()} entries · append-only
          </p>
        </div>
      </div>

      {/* Event filter buttons */}
      <div className="flex gap-2 mb-4">
        {EVENT_FILTERS.map(f => (
          <button key={f.value}
            onClick={() => { setEventFilter(f.value); setPage(1) }}
            className={`px-3 py-1 text-xs rounded border transition-colors font-mono
              ${eventFilter === f.value
                ? 'bg-gray-900 text-white border-gray-900'
                : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {isLoading && <p className="px-4 py-4 text-xs text-gray-400">Loading…</p>}
        {logs.map((log: any, i: number) => (
          <div key={log.id}
            className="flex gap-3 px-4 py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
            <div className="flex flex-col items-center pt-0.5">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_DOT[log.event] ?? 'bg-gray-300'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xs font-mono font-medium text-gray-700">{log.event}</span>
                <span className="text-xs text-gray-400">{new Date(log.created_at).toLocaleString()}</span>
                <span className="text-xs text-gray-400">· {log.actor}</span>
              </div>
              <p className="text-xs text-gray-600 mt-0.5 truncate">{log.description}</p>
            </div>
          </div>
        ))}
        {!isLoading && logs.length === 0 && (
          <p className="px-4 py-6 text-xs text-gray-400 text-center">No events match the current filter.</p>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
          <span>Page {page} of {totalPages} · {totalCount.toLocaleString()} total events</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1 border border-gray-200 rounded hover:border-gray-400 disabled:opacity-40 transition-colors">
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const n = totalPages <= 7 ? i + 1 :
                page <= 4 ? i + 1 :
                page >= totalPages - 3 ? totalPages - 6 + i :
                page - 3 + i
              return (
                <button key={n} onClick={() => setPage(n)}
                  className={`w-7 h-7 rounded text-xs transition-colors
                    ${n === page ? 'bg-gray-900 text-white' : 'border border-gray-200 hover:border-gray-400'}`}>
                  {n}
                </button>
              )
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1 border border-gray-200 rounded hover:border-gray-400 disabled:opacity-40 transition-colors">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
