'use client'

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'

interface ToggleSwitchProps {
  checked:          boolean
  onCheckedChange:  (checked: boolean) => void
  label:            string
  description?:     string
  disabled?:        boolean
  id?:              string
}

export function ToggleSwitch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  id: externalId,
}: ToggleSwitchProps) {
  const autoId   = React.useId()
  const switchId = externalId ?? autoId

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <label
          htmlFor={switchId}
          className="text-sm font-medium cursor-pointer"
        >
          {label}
        </label>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>

      <SwitchPrimitive.Root
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-input'
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0'
          )}
        />
      </SwitchPrimitive.Root>
    </div>
  )
}
