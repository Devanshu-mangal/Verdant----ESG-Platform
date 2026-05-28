'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import api, { TENANT_ID } from '@/lib/api'
import { Eye, Flag, CheckCircle, XCircle, Trash2, AlertTriangle, X } from 'lucide-react'
import ActivityDetailDrawer from '@/components/ActivityDetailDrawer'
import ConfidenceScore from '@/components/ConfidenceScore'

const STATUS_COLOR: Record<string, string> = {
  DONE:       'bg-green-100 text-green-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  PENDING:    'bg-gray-100 text-gray-600',
  FAILED:     'bg-red-100 text-red-700',
}

const ACT_STATUS_COLOR: Record<string, string> = {
  NORMALIZED:      'bg-gray-100 text-gray-600',
  FLAGGED:         'bg-amber-100 text-amber-700',
  REVIEW_REQUIRED: 'bg-red-100 text-red-700',
  APPROVED:        'bg-green-100 text-green-700',
  LOCKED:          'bg-purple-100 text-purple-700',
  INGESTED:        'bg-blue-50 text-blue-600',
}

export default function Ingestions() {
  const qc = useQueryClient()
  const [activeBatch, setActiveBatch] = useState<any>(null)
  const [activeRecord, setActiveRecord] = useState<string | null>(null)
  const [skippedBatch, setSkippedBatch] = useState<any>(null)

  const { data: batchData, isLoading } = useQuery({
    queryKey: ['batches'],
    queryFn: () => api.get('/batches/').then(r => r.data),
  })

  const { data: recordsData } = useQuery({
    queryKey: ['batch-activities', activeBatch?.id],
    queryFn: () => api.get(`/activities/?batch=${activeBatch.id}&tenant=${TENANT_ID}&page_size=100`)
      .then(r => r.data),
    enabled: !!activeBatch,
  })

  const { data: detailData } = useQuery({
    queryKey: ['activity-detail', activeRecord],
    queryFn: () => api.get(`/activities/${activeRecord}/`).then(r => r.data),
    enabled: !!activeRecord,
  })

  const { data: skippedData } = useQuery({
    queryKey: ['skipped-audit', skippedBatch?.id],
    queryFn: () => api.get(`/audit/?batch=${skippedBatch.id}&event=row.skipped&tenant=${TENANT_ID}`)
      .then(r => r.data),
    enabled: !!skippedBatch,
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/activities/${id}/approve/`, {
      reviewer: 'analyst@breatheesg.com', comment: '',
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batch-activities', activeBatch?.id] }),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/activities/${id}/reject/`, {
      reviewer: 'analyst@breatheesg.com', comment: 'Requires investigation',
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batch-activities', activeBatch?.id] }),
  })

  const flagMutation = useMutation({
    mutationFn: (id: string) => api.post(`/activities/${id}/flag/`, {
      actor: 'analyst@breatheesg.com',
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batch-activities', activeBatch?.id] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/activities/${id}/`, {
      data: { actor: 'analyst@breatheesg.com' },
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batch-activities', activeBatch?.id] }),
  })

  const activities = recordsData?.results ?? []

  return (
    <div className="flex h-full">
      {/* Main batch table */}
      <div className="flex-1 p-8 overflow-auto min-w-0">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Ingestion batches</h1>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rows</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Failed</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Anomalies</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              )}
              {batchData?.results?.map((b: any) => (
                <tr key={b.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${activeBatch?.id === b.id ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3 text-gray-700 font-medium">{b.source_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.source_type}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px] truncate">{b.file_name}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-gray-700">{b.processed_rows}</td>
                  <td className="px-4 py-3 text-right">
                    {b.failed_rows > 0 ? (
                      <button
                        onClick={() => setSkippedBatch(b)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded hover:bg-red-100 transition-colors">
                        <AlertTriangle size={10} />{b.failed_rows}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 font-mono">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {(() => {
                      const n = b.summary?.anomalies_found ?? 0
                      return n > 0
                        ? <span className="text-amber-600 font-medium">{n}</span>
                        : <span className="text-gray-400">0</span>
                    })()}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(b.uploaded_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[b.status] ?? ''}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { setActiveBatch(b); setActiveRecord(null) }}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded px-2 py-1 hover:border-gray-400 transition-colors whitespace-nowrap">
                      <Eye size={12} />
                      View records
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Batch records panel */}
      {activeBatch && (
        <div className="w-[560px] border-l border-gray-200 bg-white flex flex-col flex-shrink-0">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-900">{activeBatch.source_name}</p>
              <p className="text-xs text-gray-400">{activities.length} records · {activeBatch.file_name}</p>
            </div>
            <button onClick={() => { setActiveBatch(null); setActiveRecord(null) }}
              className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          </div>

          <div className="overflow-auto flex-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 sticky top-0">
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase">Scope</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase">Category</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-400 uppercase">Value</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-400 uppercase">Conf</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-400 uppercase">Status</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((a: any) => (
                  <tr key={a.id}
                    onClick={() => setActiveRecord(a.id)}
                    className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${activeRecord === a.id ? 'bg-blue-50' : ''}`}>
                    <td className="px-3 py-2 font-mono text-gray-500">{a.scope}</td>
                    <td className="px-3 py-2 text-gray-700 max-w-[120px] truncate">{a.category}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-600">
                      {a.activity_value?.toLocaleString()} {a.activity_unit}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <ConfidenceScore score={a.confidence_score} notes={a.confidence_notes} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ACT_STATUS_COLOR[a.status] ?? ''}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => approveMutation.mutate(a.id)}
                          className="p-1 text-gray-400 hover:text-green-600 transition-colors" title="Approve">
                          <CheckCircle size={13} />
                        </button>
                        <button onClick={() => rejectMutation.mutate(a.id)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Reject">
                          <XCircle size={13} />
                        </button>
                        <button onClick={() => flagMutation.mutate(a.id)}
                          className="p-1 text-gray-400 hover:text-amber-500 transition-colors" title="Flag for review">
                          <Flag size={13} />
                        </button>
                        {a.status !== 'LOCKED' && (
                          <button
                            onClick={() => {
                              if (confirm('Delete this record?')) deleteMutation.mutate(a.id)
                            }}
                            className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {activities.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No records</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity detail drawer */}
      {activeRecord && detailData && (
        <ActivityDetailDrawer
          id={activeRecord}
          data={detailData}
          onClose={() => setActiveRecord(null)}
          invalidateKeys={[['batch-activities', activeBatch?.id]]}
        />
      )}

      {/* Skipped rows modal */}
      {skippedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setSkippedBatch(null)}>
          <div className="bg-white rounded-lg shadow-xl w-[560px] max-h-[70vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div>
                <p className="text-sm font-medium text-gray-900">Skipped rows</p>
                <p className="text-xs text-gray-400">{skippedBatch.file_name} · {skippedBatch.failed_rows} skipped</p>
              </div>
              <button onClick={() => setSkippedBatch(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-auto flex-1 p-4 space-y-2">
              {(skippedData?.results ?? []).length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No skipped row events found in audit log.</p>
              ) : (
                (skippedData?.results ?? []).map((log: any) => (
                  <div key={log.id} className="bg-red-50 border border-red-200 rounded px-3 py-2 text-xs">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-mono text-red-700">{log.event}</span>
                      <span className="text-gray-400">{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-gray-600">{log.description}</p>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <pre className="mt-1 text-gray-500 overflow-x-auto">{JSON.stringify(log.metadata, null, 2)}</pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
