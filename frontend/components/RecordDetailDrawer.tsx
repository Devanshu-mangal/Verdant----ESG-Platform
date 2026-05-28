'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import api from '@/lib/api'
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import ConfidenceScore from './ConfidenceScore'

// ─── Severity ────────────────────────────────────────────────────────────────

export const ISSUE_SEVERITY: Record<string, string> = {
  NEGATIVE_VALUE:    'CRITICAL',
  IMPOSSIBLE_DATE:   'CRITICAL',
  ANOMALY_ZSCORE:    'HIGH',
  DUPLICATE:         'HIGH',
  UNIT_UNKNOWN:      'MEDIUM',
  MISSING_FIELD:     'MEDIUM',
  INFERRED_DISTANCE: 'LOW',
}

export const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-700 border-red-200',
  HIGH:     'bg-orange-100 text-orange-700 border-orange-200',
  MEDIUM:   'bg-amber-100 text-amber-700 border-amber-200',
  LOW:      'bg-blue-100 text-blue-700 border-blue-200',
}

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

export function topSeverity(issues: any[]): string | null {
  if (!issues?.length) return null
  for (const sev of SEVERITY_ORDER) {
    if (issues.some(i => ISSUE_SEVERITY[i.issue_type] === sev)) return sev
  }
  return 'LOW'
}

// ─── Issue explanations ───────────────────────────────────────────────────────

const ISSUE_EXPLANATION: Record<string, string> = {
  NEGATIVE_VALUE:
    'Negative quantities in SAP typically indicate a credit memo or return transaction (MB51 reversal). The emission calculation would yield a negative CO₂e value which is invalid for GHG reporting. Verify with the source system whether this is a legitimate return or a data entry error.',
  ANOMALY_ZSCORE:
    'This value is statistically unusual compared to other records in the same category. Z-score anomaly detection flagged it as more than 3 standard deviations from the category mean. This may indicate a genuine spike (e.g. increased production) or a data quality issue (e.g. wrong unit, duplicate submission).',
  INFERRED_DISTANCE:
    'Flight distance was not provided in the source data. It was estimated using the Haversine great-circle formula from IATA airport codes. Great-circle distance is the shortest path and may underestimate actual flight distance by 5–15% for long-haul routes. Per GHG Protocol guidance, this is an acceptable proxy when routing data is unavailable.',
  DUPLICATE:
    'This record shares the same scope, activity type, reporting period, and rounded value as another record in this batch. This may indicate a duplicate submission from the source system. Review both records before approving either. If one is a correction, reject the original.',
  UNIT_UNKNOWN:
    'The unit in the source data could not be matched to any known unit in the conversion table. The value was stored as-is without conversion. This will affect CO₂e calculation accuracy. Check the source system unit configuration.',
  MISSING_FIELD:
    'A required field was absent in the source record. Downstream calculations may be incomplete or inaccurate.',
  IMPOSSIBLE_DATE:
    'The date in the source record is either in the future or outside the valid reporting window. This is likely a data entry error or a system clock issue in the source.',
}

// ─── Event dot colors ─────────────────────────────────────────────────────────

const EVENT_DOT: Record<string, string> = {
  'batch.parsed':   'bg-blue-500',
  'row.normalized': 'bg-gray-400',
  'row.flagged':    'bg-amber-500',
  'row.approved':   'bg-green-500',
  'row.rejected':   'bg-red-500',
  'row.deleted':    'bg-red-500',
  'row.skipped':    'bg-gray-300',
}

// ─── Syntax-colored JSON ──────────────────────────────────────────────────────

function JsonView({ data }: { data: any }) {
  const text = JSON.stringify(data, null, 2)
  // Simple token coloring via spans; avoids dangerouslySetInnerHTML
  const lines = text.split('\n')
  return (
    <pre className="font-mono text-xs leading-relaxed overflow-auto max-h-48 bg-gray-50 rounded p-3">
      {lines.map((line, i) => {
        const keyMatch  = line.match(/^(\s*)"([^"]+)"(\s*:\s*)/)
        const strMatch  = line.match(/:\s*"([^"]*)"/)
        const numMatch  = line.match(/:\s*(-?\d+\.?\d*)/)
        const boolMatch = line.match(/:\s*(true|false|null)/)
        if (keyMatch) {
          const rest = line.slice(keyMatch[0].length)
          return (
            <span key={i}>
              <span className="text-gray-400">{keyMatch[1]}</span>
              <span className="text-blue-600">"{keyMatch[2]}"</span>
              <span className="text-gray-500">{keyMatch[3]}</span>
              {strMatch  ? <span className="text-green-700">"{rest.match(/"([^"]*)"/)?.[1] ?? ''}"</span>  :
               numMatch  ? <span className="text-orange-600">{rest.trim().replace(/,?$/, '')}</span> :
               boolMatch ? <span className="text-purple-600">{rest.trim().replace(/,?$/, '')}</span> :
               <span className="text-gray-700">{rest}</span>}
              {'\n'}
            </span>
          )
        }
        return <span key={i} className="text-gray-500">{line}{'\n'}</span>
      })}
    </pre>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  id: string | null
  data: any
  onClose: () => void
  invalidateKeys?: (string | number)[][]
}

export default function RecordDetailDrawer({ id, data, onClose, invalidateKeys = [] }: Props) {
  const qc = useQueryClient()
  const [rawOpen,   setRawOpen]   = useState(false)
  const [reviewer,  setReviewer]  = useState('analyst@breatheesg.com')
  const [comment,   setComment]   = useState('')
  const drawerRef = useRef<HTMLDivElement>(null)

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['activities'] })
    qc.invalidateQueries({ queryKey: ['activity-detail', id] })
    invalidateKeys.forEach(k => qc.invalidateQueries({ queryKey: k }))
  }

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/activities/${id}/approve/`, { reviewer, comment }),
    onSuccess: () => { invalidateAll(); setComment('') },
  })

  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/activities/${id}/reject/`, { reviewer, comment }),
    onSuccess: () => { invalidateAll(); setComment('') },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/activities/${id}/`, { data: { actor: reviewer } }),
    onSuccess: () => { invalidateAll(); onClose() },
  })

  const isOpen = !!(id && data)
  const isLocked = data?.status === 'LOCKED'

  // Source type label from source_name or batch
  const sourceLabel = data?.source_name ?? 'Source system'

  // Pipeline: is unit conversion involved?
  const unitConverted = data && data.original_unit !== data.activity_unit

  // Audit logs: oldest-first
  const auditLogs = [...(data?.audit_logs ?? [])].reverse()

  // Sort issues by severity
  const sortedIssues = [...(data?.issues ?? [])].sort((a, b) => {
    const ia = SEVERITY_ORDER.indexOf(ISSUE_SEVERITY[a.issue_type] ?? 'LOW')
    const ib = SEVERITY_ORDER.indexOf(ISSUE_SEVERITY[b.issue_type] ?? 'LOW')
    return ia - ib
  })

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-30" onClick={onClose} />
      )}

      {/* Drawer */}
      <div
        ref={drawerRef}
        className={`fixed top-0 right-0 h-full w-[440px] bg-white border-l border-gray-200 z-40 overflow-y-auto
          transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {data && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">Record detail</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${SEVERITY_STYLE[topSeverity(data.issues) ?? ''] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  {topSeverity(data.issues) ?? data.status}
                </span>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            <div className="px-5 py-4 space-y-5">

              {/* ── Section 1: Classification ───────────────────────────── */}
              <section>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Classification</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-gray-400">Scope</span>
                  <span className="font-mono text-gray-800">{data.scope}</span>
                  <span className="text-gray-400">Category</span>
                  <span className="text-gray-700">{data.category}</span>
                  <span className="text-gray-400">Activity type</span>
                  <span className="text-gray-700">{data.activity_type}</span>
                  <span className="text-gray-400">Period</span>
                  <span className="font-mono text-gray-700">
                    {data.period_start ?? '—'}{data.period_end ? ` → ${data.period_end}` : ''}
                  </span>
                  <span className="text-gray-400">Source</span>
                  <span className="text-gray-700">{data.source_name ?? '—'}</span>
                  <span className="text-gray-400">Status</span>
                  <span className={`inline-block text-xs px-1.5 py-0.5 rounded-full font-medium w-fit
                    ${data.status === 'APPROVED'        ? 'bg-green-100 text-green-700'  :
                      data.status === 'FLAGGED'         ? 'bg-amber-100 text-amber-700'  :
                      data.status === 'REVIEW_REQUIRED' ? 'bg-red-100 text-red-700'      :
                      data.status === 'LOCKED'          ? 'bg-purple-100 text-purple-700':
                      'bg-gray-100 text-gray-600'}`}>
                    {data.status}
                  </span>
                </div>
              </section>

              {/* ── Section 2: Data lineage pipeline ───────────────────── */}
              <section>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Data lineage</p>
                <div className="space-y-0">
                  {[
                    {
                      label: sourceLabel,
                      sub: 'Source system CSV ingested',
                      color: 'border-blue-400',
                    },
                    {
                      label: 'Raw record stored',
                      sub: 'Immutable — never mutated after ingest',
                      color: 'border-gray-300',
                    },
                    {
                      label: unitConverted
                        ? `Unit conversion: ${data.original_value} ${data.original_unit} → ${data.activity_value} ${data.activity_unit}`
                        : `No unit conversion (${data.activity_value} ${data.activity_unit})`,
                      sub: unitConverted ? 'Unit normalized to standard' : 'Original unit already standard',
                      color: unitConverted ? 'border-amber-400' : 'border-gray-200',
                      dim: !unitConverted,
                    },
                    {
                      label: `Emission factor applied: ${data.emission_factor ?? '—'} kg CO₂e / ${data.activity_unit}`,
                      sub: data.emission_factor_source ?? 'Source unknown',
                      color: 'border-purple-400',
                    },
                    {
                      label: `Result: ${data.co2e_kg?.toLocaleString() ?? '—'} kg CO₂e`,
                      sub: null,
                      color: 'border-green-400',
                      result: true,
                    },
                  ].map((step, i, arr) => (
                    <div key={i} className="flex gap-2">
                      <div className="flex flex-col items-center">
                        <div className={`w-2 h-2 rounded-full mt-2.5 flex-shrink-0 ${step.result ? 'bg-green-500' : 'bg-gray-300'}`} />
                        {i < arr.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-0.5 mb-0" />}
                      </div>
                      <div className={`flex-1 border-l-2 pl-2 py-1 mb-1 ${step.color} ${step.dim ? 'opacity-50' : ''}`}>
                        <p className={`text-xs font-mono ${step.result ? 'text-gray-900 font-semibold' : 'text-gray-700'}`}>
                          {step.label}
                        </p>
                        {step.sub && <p className="text-xs text-gray-400 mt-0.5">{step.sub}</p>}
                        {step.result && (
                          <div className="mt-1">
                            <ConfidenceScore score={data.confidence_score} notes={data.confidence_notes} />
                            {data.confidence_notes && (
                              <span className="ml-2 text-xs text-gray-400">{data.confidence_notes}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Section 3: Why flagged ──────────────────────────────── */}
              {sortedIssues.length > 0 && (
                <section>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Why this record was flagged</p>
                  <div className="space-y-2">
                    {sortedIssues.map((issue: any) => {
                      const sev = ISSUE_SEVERITY[issue.issue_type] ?? 'LOW'
                      return (
                        <div key={issue.id} className={`rounded border px-3 py-2.5 ${SEVERITY_STYLE[sev]}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border font-mono ${SEVERITY_STYLE[sev]}`}>
                              {sev}
                            </span>
                            <span className="text-xs font-medium">{issue.issue_type.replace(/_/g, ' ')}</span>
                          </div>
                          <p className="text-xs font-mono opacity-80 mb-1">{issue.message}</p>
                          <p className="text-xs leading-snug opacity-90">
                            {ISSUE_EXPLANATION[issue.issue_type] ?? issue.message}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              {/* ── Section 4: Raw source record (collapsible) ─────────── */}
              <section>
                <button
                  className="flex items-center gap-1 text-xs text-gray-500 uppercase tracking-wide mb-1 hover:text-gray-700 transition-colors"
                  onClick={() => setRawOpen(v => !v)}>
                  {rawOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  Raw source record
                </button>
                {rawOpen && <JsonView data={data.raw_data} />}
              </section>

              {/* ── Section 5: Audit timeline ───────────────────────────── */}
              <section>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Audit timeline</p>
                <div className="space-y-0">
                  {auditLogs.length === 0 && (
                    <p className="text-xs text-gray-400">No audit events yet.</p>
                  )}
                  {auditLogs.map((log: any, i: number) => (
                    <div key={log.id} className="flex gap-2">
                      <div className="flex flex-col items-center">
                        <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${EVENT_DOT[log.event] ?? 'bg-gray-300'}`} />
                        {i < auditLogs.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-0.5" />}
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xs font-mono text-gray-600">{log.event}</span>
                          <span className="text-xs text-gray-400">{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-gray-500">{log.description}</p>
                        <p className="text-xs text-gray-400">{log.actor}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Section 6: Prior approvals ──────────────────────────── */}
              {data.approvals?.length > 0 && (
                <section>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Review history</p>
                  <div className="space-y-1">
                    {data.approvals.map((a: any) => (
                      <div key={a.id} className="text-xs text-gray-600 border-l-2 border-gray-200 pl-2">
                        <span className={`font-medium ${a.decision === 'APPROVED' ? 'text-green-700' : 'text-red-700'}`}>
                          {a.decision}
                        </span>
                        {' '}by <span className="font-medium">{a.reviewer}</span>
                        {' · '}{new Date(a.created_at).toLocaleDateString()}
                        {a.comment && <p className="text-gray-400 mt-0.5">"{a.comment}"</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Section 7: Analyst actions ──────────────────────────── */}
              <section className="border-t border-gray-200 pt-4 space-y-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Analyst actions</p>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={reviewer}
                    onChange={e => setReviewer(e.target.value)}
                    placeholder="Reviewer name / email"
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:border-gray-400"
                  />
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Add a note for the audit trail…"
                    rows={2}
                    className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:border-gray-400 resize-none"
                  />
                </div>

                {isLocked ? (
                  <button disabled
                    className="w-full py-2 bg-gray-100 text-gray-400 text-xs rounded border border-gray-200 cursor-not-allowed">
                    Record locked — no further actions
                  </button>
                ) : (
                  <div className="flex gap-2">
                    {data.status !== 'APPROVED' && (
                      <button
                        onClick={() => approveMutation.mutate()}
                        disabled={approveMutation.isPending}
                        className="flex-1 py-2 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50 font-medium">
                        {approveMutation.isPending ? 'Approving…' : 'Approve'}
                      </button>
                    )}
                    <button
                      onClick={() => rejectMutation.mutate()}
                      disabled={rejectMutation.isPending}
                      className="flex-1 py-2 border border-red-300 text-red-600 text-xs rounded hover:bg-red-50 disabled:opacity-50 font-medium">
                      {rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this record? This cannot be undone.')) deleteMutation.mutate()
                      }}
                      disabled={deleteMutation.isPending}
                      className="px-3 py-2 border border-gray-200 text-gray-500 text-xs rounded hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
                      title="Delete record">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </section>

            </div>
          </>
        )}
      </div>
    </>
  )
}
