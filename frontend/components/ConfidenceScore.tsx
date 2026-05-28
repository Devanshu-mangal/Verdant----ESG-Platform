'use client'
import { useState } from 'react'

function scoreLabel(score: number): string {
  if (score >= 1.00) return '1.00 — Exact match, no conversion needed'
  if (score >= 0.85) return '0.85 — Known unit conversion applied'
  if (score >= 0.80) return '0.80 — Ground transport, distance provided'
  if (score >= 0.75) return '0.75 — Hotel stay, industry average EF used'
  if (score >= 0.70) return '0.70 — Flight distance calculated from IATA codes'
  return '0.60 — Unknown unit, no conversion applied'
}

function scoreColor(score: number): string {
  if (score >= 0.9) return '#16a34a'  // green-600
  if (score >= 0.7) return '#d97706'  // amber-600
  return '#ef4444'                    // red-500
}

function scoreTextClass(score: number): string {
  if (score >= 0.9) return 'text-green-600'
  if (score >= 0.7) return 'text-amber-600'
  return 'text-red-500'
}

interface Props {
  score: number
  notes?: string
  showBar?: boolean
}

export default function ConfidenceScore({ score, notes, showBar = false }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}>
      <div className="flex flex-col items-center gap-px">
        <span className={`text-xs font-mono font-medium cursor-default ${scoreTextClass(score)}`}>
          {score?.toFixed(2)}
        </span>
        {showBar && (
          <div className="w-10 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(score * 100, 100)}%`, background: scoreColor(score) }}
            />
          </div>
        )}
      </div>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-gray-900 text-white text-xs rounded p-2 pointer-events-none">
          <p className="leading-snug">{scoreLabel(score)}</p>
          {notes && (
            <p className="mt-1.5 text-gray-300 border-t border-gray-700 pt-1.5 leading-snug">{notes}</p>
          )}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  )
}
