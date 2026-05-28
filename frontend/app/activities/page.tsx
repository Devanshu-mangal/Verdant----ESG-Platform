'use client'
import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import api, { TENANT_ID } from '@/lib/api'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'
import RecordDetailDrawer, { topSeverity, SEVERITY_STYLE } from '@/components/RecordDetailDrawer'
import ConfidenceScore from '@/components/ConfidenceScore'

const STATUS_COLOR: Record<string, string> = {
  NORMALIZED:      'bg-gray-100 text-gray-600',
  FLAGGED:         'bg-amber-100 text-amber-700',
  REVIEW_REQUIRED: 'bg-red-100 text-red-700',
  APPROVED:        'bg-green-100 text-green-700',
  LOCKED:          'bg-purple-100 text-purple-700',
  INGESTED:        'bg-blue-50 text-blue-600',
}

const SCOPE_COLOR: Record<string, string> = {
  SCOPE_1: 'bg-orange-100 text-orange-700',
  SCOPE_2: 'bg-blue-100 text-blue-700',
  SCOPE_3: 'bg-purple-100 text-purple-700',
}

function ActivitiesInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [scope,      setScope]      = useState(searchParams.get('scope')       ?? '')
  const [status,     setStatus]     = useState(searchParams.get('status')      ?? '')
  const [sourceType, setSourceType] = useState(searchParams.get('source_type') ?? '')
  const [category,   setCategory]   = useState(searchParams.get('category')    ?? '')
  const [page,       setPage]       = useState(1)
  const [detailId,   setDetailId]   = useState<string | null>(null)

  useEffect(() => {
    setScope(searchParams.get('scope') ?? '')
    setStatus(searchParams.get('status') ?? '')
    setSourceType(searchParams.get('source_type') ?? '')
    setCategory(searchParams.get('category') ?? '')
    setPage(1)
  }, [searchParams])

  const { data, isLoading } = useQuery({
    queryKey: ['activities-ledger', scope, status, sourceType, category, page],
    queryFn: () => {
      const p = new URLSearchParams({ tenant: TENANT_ID, page: String(page) })
      if (scope)      p.set('scope', scope)
      if (status)     p.set('status', status)
      if (sourceType) p.set('source_type', sourceType)
      if (category)   p.set('category', category)
      return api.get(`/activities/?${p}`).then(r => r.data)
    },
  })

  const { data: detailData } = useQuery({
    queryKey: ['activity-detail', detailId],
    queryFn: () => api.get(`/activities/${detailId}/`).then(r => r.data),
    enabled: !!detailId,
  })

  const activities  = data?.results ?? []
  const totalCount  = data?.count ?? 0
  const pageSize    = 50
  const totalPages  = Math.ceil(totalCount / pageSize)

  function exportCSV() {
    if (!activities.length) return
    const cols = ['id','scope','category','activity_type','activity_value','activity_unit',
                  'co2e_kg','confidence_score','status','period_start','source_name']
    const header = cols.join(',')
    const rows = activities.map((a: any) =>
      cols.map(c => JSON.stringify(a[c] ?? '')).join(',')
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const el   = document.createElement('a')
    el.href = url; el.download = 'activities.csv'; el.click()
    URL.revokeObjectURL(url)
  }

  function setFilter(key: string, value: string) {
    const p = new URLSearchParams(searchParams.toString())
    if (value) p.set(key, value); else p.delete(key)
    router.push(`/activities?${p}`)
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Activities ledger</h1>
          <p className="text-sm text-gray-500 mt-0.5">{totalCount.toLocaleString()} records</p>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded text-sm text-gray-600 hover:border-gray-400 transition-colors">
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="flex gap-1">
          {['', 'SCOPE_1', 'SCOPE_2', 'SCOPE_3'].map(s => (
            <button key={s} onClick={() => setFilter('scope', s)}
              className={`px-3 py-1 text-xs rounded border transition-colors
                ${scope === s ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
              {s || 'All scopes'}
            </button>
          ))}
        </div>
        <select value={status} onChange={e => setFilter('status', e.target.value)}
          className="px-2 py-1 text-xs border border-gray-300 rounded text-gray-600 bg-white hover:border-gray-400 transition-colors">
          <option value="">All statuses</option>
          {['INGESTED','NORMALIZED','FLAGGED','REVIEW_REQUIRED','APPROVED','LOCKED'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {category && (
          <span className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded border border-gray-200">
            category: {category}
            <button onClick={() => setFilter('category', '')} className="text-gray-400 hover:text-gray-700 ml-0.5">×</button>
          </span>
        )}
        {sourceType && (
          <span className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded border border-gray-200">
            source: {sourceType}
            <button onClick={() => setFilter('source_type', '')} className="text-gray-400 hover:text-gray-700 ml-0.5">×</button>
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase">Scope</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase">Category / Type</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-400 uppercase">Value</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-400 uppercase">CO₂e kg</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-400 uppercase">Conf</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-400 uppercase">Issues</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-400 uppercase">Status</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase">Period</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase">Source</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">Loading…</td></tr>
            )}
            {activities.map((a: any) => {
              const sev = topSeverity(a.issues)
              return (
                <tr key={a.id}
                  onClick={() => setDetailId(a.id)}
                  className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${detailId === a.id ? 'bg-blue-50' : ''}`}>
                  <td className="px-3 py-1.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${SCOPE_COLOR[a.scope] ?? 'bg-gray-100 text-gray-600'}`}>
                      {a.scope}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 max-w-[160px]">
                    <p className="text-gray-700 truncate">{a.category}</p>
                    <p className="text-gray-400 truncate">{a.activity_type}</p>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-700">
                    {a.activity_value?.toLocaleString()} <span className="text-gray-400">{a.activity_unit}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-700">
                    {a.co2e_kg?.toLocaleString() ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <ConfidenceScore score={a.confidence_score} notes={a.confidence_notes} showBar />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {sev ? (
                      <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${SEVERITY_STYLE[sev]}`}>
                        {sev} · {a.issues.length}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLOR[a.status] ?? ''}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-gray-500">{a.period_start ?? '—'}</td>
                  <td className="px-3 py-1.5 text-gray-500 max-w-[100px] truncate">{a.source_name}</td>
                </tr>
              )
            })}
            {!isLoading && activities.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">No records match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
          <span>Page {page} of {totalPages} · {totalCount.toLocaleString()} total</span>
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

      {/* Slide-over detail drawer */}
      <RecordDetailDrawer
        id={detailId}
        data={detailData ?? null}
        onClose={() => setDetailId(null)}
        invalidateKeys={[['activities-ledger', scope, status, sourceType, category, page]]}
      />
    </div>
  )
}

export default function ActivitiesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-400">Loading…</div>}>
      <ActivitiesInner />
    </Suspense>
  )
}
