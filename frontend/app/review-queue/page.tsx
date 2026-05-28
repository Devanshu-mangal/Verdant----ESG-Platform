'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api, { TENANT_ID } from '@/lib/api'
import { CheckCircle } from 'lucide-react'
import RecordDetailDrawer, { topSeverity, SEVERITY_STYLE, ISSUE_SEVERITY } from '@/components/RecordDetailDrawer'
import ConfidenceScore from '@/components/ConfidenceScore'

const STATUS_COLOR: Record<string, string> = {
  NORMALIZED:      'bg-gray-100 text-gray-600',
  FLAGGED:         'bg-amber-100 text-amber-700',
  REVIEW_REQUIRED: 'bg-red-100 text-red-700',
  APPROVED:        'bg-green-100 text-green-700',
  LOCKED:          'bg-purple-100 text-purple-700',
}

export default function ReviewQueue() {
  const qc = useQueryClient()
  const [selected,     setSelected]     = useState<string[]>([])
  const [scopeFilter,  setScopeFilter]  = useState('')
  const [statusFilter, setStatusFilter] = useState('FLAGGED')
  const [detailId,     setDetailId]     = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['activities', scopeFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ tenant: TENANT_ID })
      if (scopeFilter)  params.set('scope', scopeFilter)
      if (statusFilter) params.set('status', statusFilter)
      return api.get(`/activities/?${params}`).then(r => r.data)
    },
  })

  const { data: detailData } = useQuery({
    queryKey: ['activity-detail', detailId],
    queryFn: () => api.get(`/activities/${detailId}/`).then(r => r.data),
    enabled: !!detailId,
  })

  const bulkApproveMutation = useMutation({
    mutationFn: () => api.post('/activities/bulk_approve/', {
      ids: selected, reviewer: 'analyst@breatheesg.com',
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activities'] }); setSelected([]) },
  })

  const activities = data?.results ?? []

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Review queue</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data?.count ?? 0} records · analyst sign-off required before audit lock
          </p>
        </div>
        {selected.length > 0 && (
          <button onClick={() => bulkApproveMutation.mutate()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700">
            <CheckCircle size={14} />
            Approve {selected.length} selected
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-3">
        {['', 'SCOPE_1', 'SCOPE_2', 'SCOPE_3'].map(s => (
          <button key={s} onClick={() => setScopeFilter(s)}
            className={`px-3 py-1 text-xs rounded border transition-colors
              ${scopeFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
            {s || 'All scopes'}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {['', 'FLAGGED', 'REVIEW_REQUIRED', 'NORMALIZED', 'APPROVED'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-xs rounded border transition-colors
                ${statusFilter === s ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="w-8 px-3 py-2">
                <input type="checkbox"
                  onChange={e => setSelected(e.target.checked ? activities.map((a: any) => a.id) : [])} />
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Scope</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category / Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">CO₂e kg</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Conf</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Issues</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
            )}
            {activities.map((a: any) => {
              const sev = topSeverity(a.issues)
              return (
                <tr key={a.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors
                    ${selected.includes(a.id) ? 'bg-blue-50' : ''}`}
                  onClick={() => setDetailId(a.id)}>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.includes(a.id)}
                      onChange={e => setSelected(prev =>
                        e.target.checked ? [...prev, a.id] : prev.filter(x => x !== a.id))} />
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs max-w-[100px] truncate">{a.source_name}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs font-mono text-gray-500">{a.scope}</span>
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-xs text-gray-700">{a.category}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.activity_type}</p>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{a.period_start ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-700 text-xs">
                    {a.activity_value?.toLocaleString()} {a.activity_unit}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-gray-700 text-xs">
                    {a.co2e_kg?.toLocaleString() ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <ConfidenceScore score={a.confidence_score} notes={a.confidence_notes} showBar />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {sev ? (
                      <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${SEVERITY_STYLE[sev]}`}>
                        {sev} · {a.issues.length}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[a.status] ?? ''}`}>
                      {a.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Slide-over detail drawer */}
      <RecordDetailDrawer
        id={detailId}
        data={detailData ?? null}
        onClose={() => setDetailId(null)}
      />
    </div>
  )
}
