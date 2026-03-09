'use client'

import { useState, useEffect, useCallback } from 'react'
import type { NumberFormat, SupportedCurrency } from '@/lib/types'

export interface UserSettings {
  currency:     SupportedCurrency
  numberFormat: NumberFormat
  fyEndMonth:   number   // 1–12; 6 = June (AU default)
}

const DEFAULTS: UserSettings = {
  currency:     'AUD',
  numberFormat: 'thousands',
  fyEndMonth:   6,
}

interface UseUserSettingsReturn {
  settings: UserSettings
  loading:  boolean
  save:     (partial: Partial<UserSettings>) => Promise<void>
  reload:   () => void
}

export function useUserSettings(): UseUserSettingsReturn {
  const [settings, setSettings] = useState<UserSettings>(DEFAULTS)
  const [loading,  setLoading]  = useState(true)
  const [tick,     setTick]     = useState(0)

  useEffect(() => {
    setLoading(true)
    fetch('/api/settings')
      .then(r => r.json())
      .then(json => {
        if (json.data) {
          setSettings({
            currency:     json.data.currency     ?? DEFAULTS.currency,
            numberFormat: json.data.number_format ?? DEFAULTS.numberFormat,
            fyEndMonth:   json.data.fy_end_month  ?? DEFAULTS.fyEndMonth,
          })
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tick])

  const save = useCallback(async (partial: Partial<UserSettings>) => {
    const body: Record<string, unknown> = {}
    if (partial.currency     !== undefined) body.currency      = partial.currency
    if (partial.numberFormat !== undefined) body.number_format = partial.numberFormat
    if (partial.fyEndMonth   !== undefined) body.fy_end_month  = partial.fyEndMonth

    const res  = await fetch('/api/settings', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to save settings')

    if (json.data) {
      setSettings({
        currency:     json.data.currency     ?? settings.currency,
        numberFormat: json.data.number_format ?? settings.numberFormat,
        fyEndMonth:   json.data.fy_end_month  ?? settings.fyEndMonth,
      })
    }
  }, [settings])

  const reload = useCallback(() => setTick(t => t + 1), [])

  return { settings, loading, save, reload }
}
