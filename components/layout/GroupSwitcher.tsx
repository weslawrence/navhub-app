'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { switchGroup } from '@/app/(auth)/actions'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Group, UserGroup } from '@/lib/types'

interface GroupSwitcherProps {
  groups:      UserGroup[]
  activeGroup: Group
}

export default function GroupSwitcher({ groups, activeGroup }: GroupSwitcherProps) {
  const router   = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleSwitch(groupId: string) {
    if (groupId === activeGroup.id || loading) return
    setLoading(true)

    const result = await switchGroup(groupId)

    if ('primaryColor' in result) {
      // Apply new group colour immediately
      document.documentElement.style.setProperty('--group-primary', result.primaryColor)
    }

    router.push('/dashboard')
    router.refresh()
    setLoading(false)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent transition-colors focus:outline-none disabled:opacity-50"
        disabled={loading}
      >
        {/* Colour swatch */}
        <span
          className="h-3 w-3 rounded-full ring-1 ring-border"
          style={{ backgroundColor: activeGroup.primary_color }}
        />
        <span className="max-w-[140px] truncate">{activeGroup.name}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Your groups
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {groups.map((ug) => {
          const group = ug.group!
          return (
            <DropdownMenuItem
              key={group.id}
              onSelect={() => handleSwitch(group.id)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <span
                className="h-3 w-3 rounded-full ring-1 ring-border shrink-0"
                style={{ backgroundColor: group.primary_color }}
              />
              <span className="truncate">{group.name}</span>
              {group.id === activeGroup.id && (
                <span className="ml-auto text-xs text-muted-foreground">Active</span>
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
