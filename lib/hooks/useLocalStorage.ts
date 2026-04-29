'use client'

import { useCallback, useState } from 'react'

/**
 * Persistent state hook backed by localStorage.
 *
 * - SSR-safe: reads from localStorage only on first client render. Server
 *   renders return the default; React reconciles when the client mounts.
 * - Setter accepts either a value or an updater function (matches useState).
 * - Errors are swallowed (private mode, quota, etc.) — falls back to in-memory.
 */
export function useLocalStorage<T>(key: string, defaultValue: T): readonly [T, (newValue: T | ((prev: T) => T)) => void] {
  const [value, setValueState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue
    try {
      const raw = window.localStorage.getItem(key)
      return raw === null ? defaultValue : JSON.parse(raw) as T
    } catch {
      return defaultValue
    }
  })

  const setValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValueState(prev => {
      const resolved = typeof newValue === 'function'
        ? (newValue as (p: T) => T)(prev)
        : newValue
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(resolved))
        }
      } catch { /* ignore */ }
      return resolved
    })
  }, [key])

  return [value, setValue] as const
}
