'use client'
import { useQuery } from '@tanstack/react-query'
import api, { TENANT_ID } from '@/lib/api'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'

const SCOPE_COLORS: Record<string, string> = {
  SCOPE_1: '#ea580c',
  SCOPE_2: '#2563eb',
  SCOPE_3: '#7c3aed',
}

const HEALTH_COLOR: Record<string, string> = {
  GOOD:    'text-green-600 bg-green-50 border-green-200',
  AVERAGE: 'text-amber-600 bg-amber-50 border-amber-200',
  POOR:    'text-red-600 bg-red-50 border-red-200',
}

function fmt(n: number) {
  if (!n) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}kt`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}t`
  return `${n.toFixed(0)} kg`
}

function pct(n: number) { return `${(n * 100).toFixed(1)}%` }

/** Returns signed % change vs previous period, or null if no prior data. */
function trendVsPrev(trend: any[], scope: string): number | null {
  if (trend.length < 2) return null
  const cur  = trend[trend.length - 1]?.[scope] ?? 0
  const prev = trend[trend.length - 2]?.[scope] ?? 0
  if (prev === 0) return null
  return ((cur - prev) / prev) * 100
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded shadow-sm p-3 text-xs">
      <p className="font-medium text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-medium">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const router = useRouter()

  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api.get(`/analytics/?tenant=${TENANT_ID}`).then(r => r.data),
  })
  const { data: flaggedData } = useQuery({
    queryKey: ['flagged-count'],
    queryFn: () => api.get(`/activities/?tenant=${TENANT_ID}&flagged=true&page_size=1`).then(r => r.data),
  })
  const { data: auditData } = useQuery({
    queryKey: ['audit-count'],
    queryFn: () => api.get(`/audit/?tenant=${TENANT_ID}&page_size=1`).then(r => r.data),
  })

  if (isLoading) return <div className="p-8 text-sm text-gray-400">Loading analytics…</div>

  const s       = analyticsData?.scope_breakdown ?? {}
  const ins     = analyticsData?.insights ?? {}
  const trend   = analyticsData?.monthly_trend ?? []
  const health  = analyticsData?.source_health ?? []
  const topCats = analyticsData?.top_categories ?? []

  const totalCo2 = (s.SCOPE_1?.co2e_kg ?? 0) + (s.SCOPE_2?.co2e_kg ?? 0) + (s.SCOPE_3?.co2e_kg ?? 0)

  const pieData = [
    { name: 'Scope 1', value: s.SCOPE_1?.co2e_kg ?? 0, scope: 'SCOPE_1' },
    { name: 'Scope 2', value: s.SCOPE_2?.co2e_kg ?? 0, scope: 'SCOPE_2' },
    { name: 'Scope 3', value: s.SCOPE_3?.co2e_kg ?? 0, scope: 'SCOPE_3' },
  ]

  const scopeCards = [
    { scope: 'SCOPE_1', label: 'Scope 1 · Direct',      bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', val: s.SCOPE_1 },
    { scope: 'SCOPE_2', label: 'Scope 2 · Electricity',  bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   val: s.SCOPE_2 },
    { scope: 'SCOPE_3', label: 'Scope 3 · Travel',       bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', val: s.SCOPE_3 },
  ]

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">ESG Operations Console</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Acme Corporation · 2024 reporting period · {ins.total ?? 0} activities ingested
          </p>
        </div>
        <Link href="/upload"
          className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded hover:bg-gray-800 transition-colors">
          + Upload data
        </Link>
      </div>

      {/* Row 1 — KPIs */}
      <div className="grid grid-cols-6 gap-3">
        {/* Total */}
        <div className="col-span-2 bg-gray-900 text-white rounded-lg p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total CO₂e</p>
          <p className="mt-1 text-3xl font-semibold">{fmt(totalCo2)}</p>
          <p className="text-xs text-gray-400 mt-1">all scopes · {ins.total} activities</p>
        </div>

        {/* Scope cards with trend */}
        {scopeCards.map(sc => {
          const change = trendVsPrev(trend, sc.scope)
          return (
            <button key={sc.scope}
              onClick={() => router.push(`/activities?scope=${sc.scope}`)}
              className={`${sc.bg} border ${sc.border} rounded-lg p-4 text-left cursor-pointer hover:brightness-95 transition-all`}>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{sc.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${sc.text}`}>{fmt(sc.val?.co2e_kg ?? 0)}</p>
              <p className="text-xs text-gray-400 mt-1">
                {sc.val?.count ?? 0} records · conf {sc.val?.avg_confidence?.toFixed(2)}
              </p>
              <p className={`text-xs font-medium mt-1 ${change === null ? 'text-gray-400' : change >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                {change === null
                  ? 'First period'
                  : change >= 0
                    ? `↑ ${change.toFixed(1)}% vs prev month`
                    : `↓ ${Math.abs(change).toFixed(1)}% vs prev month`}
              </p>
            </button>
          )
        })}

        {/* Flagged */}
        <button
          onClick={() => router.push('/review-queue')}
          className="bg-white border border-amber-200 rounded-lg p-4 text-left cursor-pointer hover:bg-amber-50 transition-colors">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Flagged</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{flaggedData?.count ?? ins.flagged ?? 0}</p>
          <p className="text-xs text-gray-400 mt-1">require review</p>
        </button>
      </div>

      {/* Row 2 — Charts */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Monthly emissions trend (kg CO₂e)</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trend} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} width={50} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="SCOPE_1" stackId="1" stroke="#ea580c" fill="#fed7aa" name="Scope 1" />
              <Area type="monotone" dataKey="SCOPE_2" stackId="1" stroke="#2563eb" fill="#bfdbfe" name="Scope 2" />
              <Area type="monotone" dataKey="SCOPE_3" stackId="1" stroke="#7c3aed" fill="#ddd6fe" name="Scope 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Emissions by scope</p>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                dataKey="value" paddingAngle={2}
                onClick={(entry: any) => router.push(`/activities?scope=${entry.scope}`)}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={['#ea580c', '#2563eb', '#7c3aed'][i]} className="cursor-pointer" />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => fmt(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-1">
            {pieData.map((d, i) => (
              <button key={d.name}
                onClick={() => router.push(`/activities?scope=${d.scope}`)}
                className="w-full flex items-center justify-between text-xs hover:bg-gray-50 rounded px-1 py-0.5 transition-colors cursor-pointer">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ background: ['#ea580c', '#2563eb', '#7c3aed'][i] }} />
                  <span className="text-gray-600">{d.name}</span>
                </div>
                <span className="font-medium text-gray-700">{totalCo2 > 0 ? pct(d.value / totalCo2) : '0%'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3 — Source health + Normalization insights + Hotspots */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Source data health</p>
          <div className="space-y-3">
            {health.map((h: any) => (
              <button key={h.source_type}
                onClick={() => router.push(`/activities?source_type=${h.source_type}`)}
                className="w-full text-left hover:bg-gray-50 rounded p-1 -mx-1 transition-colors cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{h.label}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${HEALTH_COLOR[h.health]}`}>
                    {h.health}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{h.processed} rows</span>
                  <span className={h.failed > 0 ? 'text-red-500' : ''}>{h.failed} failed</span>
                  <span>{h.anomalies} anomalies</span>
                  <span>conf {h.avg_confidence?.toFixed(2)}</span>
                </div>
                <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{
                      width: `${h.total_rows > 0 ? (h.processed / h.total_rows) * 100 : 0}%`,
                      background: h.health === 'GOOD' ? '#22c55e' : h.health === 'AVERAGE' ? '#f59e0b' : '#ef4444',
                    }} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Normalization intelligence</p>
          <div className="space-y-2">
            {[
              { label: 'Avg confidence score',     value: ins.avg_confidence?.toFixed(3),        accent: ins.avg_confidence >= 0.9 ? 'text-green-600' : 'text-amber-600' },
              { label: 'Normalization rate',        value: pct(ins.normalization_rate ?? 0),       accent: 'text-blue-600' },
              { label: 'Unit conversions applied',  value: ins.unit_conversions,                   accent: 'text-gray-700' },
              { label: 'Distances inferred (IATA)', value: ins.inferred_distances,                 accent: 'text-purple-600' },
              { label: 'Duplicate risks detected',  value: ins.duplicates_detected,                accent: ins.duplicates_detected > 0 ? 'text-amber-600' : 'text-green-600' },
              { label: 'Negative values flagged',   value: ins.negative_values,                    accent: ins.negative_values > 0 ? 'text-red-600' : 'text-green-600' },
              { label: 'Low confidence rows',       value: ins.low_confidence,                     accent: ins.low_confidence > 0 ? 'text-amber-600' : 'text-green-600' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-500">{row.label}</span>
                <span className={`text-xs font-semibold ${row.accent}`}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Emission hotspots</p>
          <div className="space-y-2">
            {topCats.slice(0, 6).map((cat: any, i: number) => (
              <button key={i}
                onClick={() => router.push(`/activities?category=${encodeURIComponent(cat.category)}`)}
                className="w-full text-left hover:bg-gray-50 rounded transition-colors cursor-pointer">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: SCOPE_COLORS[cat.scope] }} />
                    <span className="text-xs text-gray-700">{cat.category}</span>
                  </div>
                  <span className="text-xs font-medium text-gray-700">{fmt(cat.total)}</span>
                </div>
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{
                      width: `${totalCo2 > 0 ? Math.min((cat.total / totalCo2) * 100 * 3, 100) : 0}%`,
                      background: SCOPE_COLORS[cat.scope],
                      opacity: 0.7,
                    }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4 — Bar chart + Audit readiness */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Emissions by category (kg CO₂e)</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={topCats.slice(0, 6)} layout="vertical"
              margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => fmt(v)} />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={130} />
              <Tooltip formatter={(v: any) => fmt(v)} />
              <Bar dataKey="total" radius={[0, 3, 3, 0]}
                onClick={(entry: any) => router.push(`/activities?category=${encodeURIComponent(entry.category)}`)}>
                {topCats.slice(0, 6).map((cat: any, i: number) => (
                  <Cell key={i} fill={SCOPE_COLORS[cat.scope] || '#6b7280'} className="cursor-pointer" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Audit readiness</p>
          <div className="space-y-2.5">
            {[
              { label: 'Raw records preserved',     ok: true,  note: 'immutable, never mutated' },
              { label: 'Full data lineage',          ok: true,  note: 'source → raw → normalized' },
              { label: 'Normalization logged',       ok: true,  note: `${auditData?.count ?? 0} audit events` },
              { label: 'Analyst approvals tracked',  ok: true,  note: `${ins.approved ?? 0} approved` },
              { label: 'Anomalies flagged',          ok: true,  note: `${ins.flagged ?? 0} flagged for review` },
              { label: 'Pending review',             ok: (ins.flagged ?? 0) === 0,
                note: ins.flagged > 0 ? `${ins.flagged} need sign-off` : 'none pending' },
            ].map(row => (
              <div key={row.label} className="flex items-start gap-2">
                <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${row.ok ? 'bg-green-500' : 'bg-amber-400'}`} />
                <div>
                  <p className="text-xs text-gray-700">{row.label}</p>
                  <p className="text-xs text-gray-400">{row.note}</p>
                </div>
              </div>
            ))}
          </div>
          <Link href="/review-queue"
            className="mt-3 block text-center text-xs py-1.5 border border-gray-200 rounded text-gray-600 hover:border-gray-400 transition-colors">
            Open review queue →
          </Link>
        </div>
      </div>
    </div>
  )
}
