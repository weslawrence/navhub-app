'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface StatsResponse {
  data?: {
    last_scan: {
      id:             string
      scan_type:      string
      summary:        string | null
      started_at:     string
      completed_at:   string | null
      findings_count: number
      critical_count: number
    } | null
    counts: { critical: number; warning: number; info: number; positive: number }
  }
  error?: string
}

export default function SageHomePanel() {
  const [stats,   setStats]   = useState<StatsResponse['data'] | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanBusy, setScanBusy] = useState(false)

  function load() {
    setLoading(true)
    fetch('/api/admin/sage/stats')
      .then(r => r.json())
      .then((j: StatsResponse) => setStats(j.data ?? null))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  async function runFirstScan() {
    setScanBusy(true)
    try {
      await fetch('/api/admin/sage/scan', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ scan_type: 'adhoc', period_days: 7 }),
      })
      load()
    } finally {
      setScanBusy(false)
    }
  }

  const counts = stats?.counts ?? { critical: 0, warning: 0, info: 0, positive: 0 }
  const critical = counts.critical

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Sage</span>
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">Platform intelligence</span>
          {critical > 0 && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">
              {critical} critical
            </span>
          )}
        </div>
        <Link href="/admin/sage" className="text-xs text-amber-400 hover:text-amber-300">
          View all findings →
        </Link>
      </div>

      {loading ? (
        <p className="text-xs text-zinc-500">Loading…</p>
      ) : stats?.last_scan ? (
        <>
          {stats.last_scan.summary && (
            <p className="text-sm text-zinc-300 whitespace-pre-wrap">{stats.last_scan.summary}</p>
          )}
          <div className="flex flex-wrap gap-3 text-xs">
            <Pill colour="red"     label={`${counts.critical} critical`} />
            <Pill colour="amber"   label={`${counts.warning} warnings`}  />
            <Pill colour="sky"     label={`${counts.info} info`}         />
            <Pill colour="emerald" label={`${counts.positive} positive`} />
            <span className="ml-auto text-zinc-500">
              Last scan: {new Date(stats.last_scan.completed_at ?? stats.last_scan.started_at).toLocaleString('en-AU', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
              {' · '}{stats.last_scan.scan_type}
            </span>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            No scans yet. Run one to see Sage&apos;s analysis of platform health.
          </p>
          <button
            onClick={runFirstScan}
            disabled={scanBusy}
            className="text-xs px-3 py-1.5 rounded bg-amber-500 text-zinc-900 font-semibold hover:bg-amber-400 disabled:opacity-60"
          >
            {scanBusy ? 'Running…' : 'Run first scan'}
          </button>
        </div>
      )}
    </div>
  )
}

function Pill({ colour, label }: { colour: 'red'|'amber'|'sky'|'emerald'; label: string }) {
  const tone = {
    red:     'text-red-300',
    amber:   'text-amber-300',
    sky:     'text-sky-300',
    emerald: 'text-emerald-300',
  }[colour]
  return <span className={tone}>{label}</span>
}
