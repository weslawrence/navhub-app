'use client'

import { useState } from 'react'
import { Plug, ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyOption  { id: string; name: string }
interface DivisionOption { id: string; name: string; company_name: string }

interface ConnectXeroProps {
  companies: CompanyOption[]
  divisions: DivisionOption[]
}

type EntitySelection =
  | { type: 'company';  id: string; name: string }
  | { type: 'division'; id: string; name: string }

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConnectXero({ companies, divisions }: ConnectXeroProps) {
  const [selected,    setSelected]    = useState<EntitySelection | null>(null)
  const [confirming,  setConfirming]  = useState(false)

  function handleSelectChange(value: string) {
    setConfirming(false)
    if (!value) { setSelected(null); return }

    const [type, id] = value.split('::')
    if (type === 'company') {
      const company = companies.find(c => c.id === id)
      if (company) setSelected({ type: 'company', id, name: company.name })
    } else if (type === 'division') {
      const division = divisions.find(d => d.id === id)
      if (division) setSelected({ type: 'division', id, name: division.name })
    }
  }

  function buildOAuthUrl(): string {
    if (!selected) return '#'
    return `/api/xero/connect?entity_type=${selected.type}&entity_id=${selected.id}`
  }

  function handleConnectClick() {
    if (!selected) return
    setConfirming(true)
  }

  function handleConfirm() {
    window.open(buildOAuthUrl(), '_blank', 'noopener,noreferrer')
    setConfirming(false)
  }

  // No companies to connect → guide the user
  if (companies.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Plug className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm text-center">
            Add companies first, then connect Xero to each one.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary" />
          Add Xero connection
        </CardTitle>
        <CardDescription className="text-xs">
          Connect a company or division to their Xero organisation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Entity selector */}
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            defaultValue=""
            onChange={e => handleSelectChange(e.target.value)}
          >
            <option value="">Select company or division…</option>

            {companies.length > 0 && (
              <optgroup label="Companies">
                {companies.map(c => (
                  <option key={c.id} value={`company::${c.id}`}>{c.name}</option>
                ))}
              </optgroup>
            )}

            {divisions.length > 0 && (
              <optgroup label="Divisions">
                {divisions.map(d => (
                  <option key={d.id} value={`division::${d.id}`}>
                    {d.name} ({d.company_name})
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          <Button
            size="sm"
            disabled={!selected || confirming}
            onClick={handleConnectClick}
          >
            <Plug className="mr-1.5 h-3.5 w-3.5" />
            Connect{selected ? ` ${selected.name}` : ''}
          </Button>
        </div>

        {/* Confirmation panel */}
        {confirming && selected && (
          <div className={cn(
            'rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3'
          )}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Connect to Xero?</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You&apos;ll be taken to Xero in a new window to authorise access for{' '}
                  <span className="font-semibold text-foreground">{selected.name}</span>.
                </p>
              </div>
              <button
                onClick={() => setConfirming(false)}
                className="text-muted-foreground hover:text-foreground mt-0.5 flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleConfirm}
                className="gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Xero
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  )
}
