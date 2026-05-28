'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Trash2 } from 'lucide-react'
import ConfidenceScore from './ConfidenceScore'

const SEVERITY_COLOR: Record<string, string> = {
  ERROR:   'bg-red-100 text-red-700 border-red-200',
  WARNING: 'bg-amber-100 text-amber-700 border-amber-200',
  INFO:    'bg-blue-100 text-blue-700 border-blue-200',
}

function issueExplanation(issue: any): string {
  const m = issue.metadata ?? {}
  switch (issue.issue_type) {
    case 'ANOMALY_ZSCORE':
      return `This value is ${m.z_score ?? '?'} standard deviations above the category mean of ${m.mean ?? '?'}. Likely caused by: data entry error, unusually large shipment, or incorrect unit selection.`
    case 'NEGATIVE_VALUE':
      return 'Negative quantity detected. In SAP this typically indicates a credit memo or return. Verify with source system before approving.'
    case 'INFERRED_DISTANCE': {
      const origin = m.origin ?? issue.message?.match(/([A-Z]{3})\s*→/)?.[1] ?? '?'
      const dest   = m.dest   ?? issue.message?.match(/→\s*([A-Z]{3})/)?.[1] ?? '?'
      return `Flight distance was calculated using great-circle formula from IATA codes ${origin}→${dest}. Actual routing may differ by up to 15%.`
    }
    case 'DUPLICATE':
      return 'This record shares the same scope, activity type, period, and value as another row. Review both before approving either.'
    default:
      return issue.message
  }
}

interface Props {
  id: string
  data: any
  onClose: () => void
  invalidateKeys?: string[][]
}

export default function ActivityDetailDrawer({ id, data, onClose, invalidateKeys = [] }: Props) {
  const qc = useQueryClient()

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['activities'] })
    invalidateKeys.forEach(k => qc.invalidateQueries({ queryKey: k }))
  }

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/activities/${id}/approve/`, {
      reviewer: 'analyst@breatheesg.com', comment: '',
    }),
    onSuccess: () => { invalidate(); onClose() },
  })

  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/activities/${id}/reject/`, {
      reviewer: 'analyst@breatheesg.com', comment: 'Requires investigation',
    }),
    onSuccess: () => { invalidate(); onClose() },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/activities/${id}/`, {
      data: { actor: 'analyst@breatheesg.com' },
    }),
    onSuccess: () => { invalidate(); onClose() },
  })

  return (
    <div className="w-96 border-l border-gray-200 bg-white overflow-auto flex-shrink-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
        <span className="text-sm font-medium text-gray-900">Record detail</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Classification */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Classification</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Scope</span><span className="font-mono text-gray-800">{data.scope}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Category</span><span className="text-gray-800">{data.category}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="text-gray-800">{data.activity_type}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Period</span><span className="font-mono text-gray-600 text-xs">{data.period_start ?? '—'}</span></div>
          </div>
        </div>

        {/* Normalization diff */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Normalization</p>
          <div className="bg-gray-50 rounded p-3 font-mono text-xs space-y-1">
            <div className="flex justify-between text-gray-500">
              <span>Original</span>
              <span>{data.original_value} {data.original_unit}</span>
            </div>
            <div className="border-t border-gray-200 pt-1 flex justify-between text-gray-900">
              <span>Normalized</span>
              <span>{data.activity_value} {data.activity_unit}</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>CO₂e</span>
              <span>{data.co2e_kg} kg</span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>EF source</span>
              <span>{data.emission_factor_source}</span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <ConfidenceScore score={data.confidence_score} notes={data.confidence_notes} />
            <span className="text-xs text-gray-400">confidence</span>
            {data.confidence_notes && (
              <span className="text-xs text-gray-400">· {data.confidence_notes}</span>
            )}
          </div>
        </div>

        {/* Validation issues with explanations */}
        {data.issues?.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Validation issues</p>
            <div className="space-y-2">
              {data.issues.map((issue: any) => (
                <div key={issue.id} className={`text-xs px-3 py-2.5 rounded border ${SEVERITY_COLOR[issue.severity]}`}>
                  <p className="font-semibold mb-0.5">{issue.issue_type.replace(/_/g, ' ')}</p>
                  <p className="opacity-90 leading-snug">{issueExplanation(issue)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Raw source data */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Raw source record</p>
          <pre className="bg-gray-50 rounded p-3 text-xs text-gray-600 overflow-auto max-h-40 leading-relaxed">
            {JSON.stringify(data.raw_data, null, 2)}
          </pre>
        </div>

        {/* Audit timeline */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Audit timeline</p>
          <div className="space-y-2">
            {data.audit_logs?.map((log: any) => (
              <div key={log.id} className="flex gap-2 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
                <div>
                  <span className="font-mono text-gray-500">{log.event}</span>
                  <p className="text-gray-600">{log.description}</p>
                  <p className="text-gray-400">{new Date(log.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-gray-200">
          <button
            onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="flex-1 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50">
            Approve
          </button>
          <button
            onClick={() => rejectMutation.mutate()}
            disabled={rejectMutation.isPending}
            className="flex-1 py-2 border border-red-300 text-red-600 text-sm rounded hover:bg-red-50 disabled:opacity-50">
            Reject
          </button>
          {data.status !== 'LOCKED' && (
            <button
              onClick={() => {
                if (confirm('Delete this record? This cannot be undone.')) deleteMutation.mutate()
              }}
              disabled={deleteMutation.isPending}
              className="p-2 border border-gray-200 text-gray-400 rounded hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50"
              title="Delete record">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
