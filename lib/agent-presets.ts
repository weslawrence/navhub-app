export interface AvatarPreset {
  key:    string
  emoji:  string
  label:  string
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { key: 'robot',     emoji: '🤖',    label: 'Robot'     },
  { key: 'analyst',   emoji: '📊',    label: 'Analyst'   },
  { key: 'lawyer',    emoji: '⚖️',    label: 'Lawyer'    },
  { key: 'doctor',    emoji: '👩‍⚕️',  label: 'Doctor'    },
  { key: 'engineer',  emoji: '🧑‍💻',  label: 'Engineer'  },
  { key: 'manager',   emoji: '👔',    label: 'Manager'   },
  { key: 'assistant', emoji: '💼',    label: 'Assistant' },
  { key: 'finance',   emoji: '💰',    label: 'Finance'   },
  { key: 'hr',        emoji: '👥',    label: 'HR'        },
  { key: 'marketing', emoji: '📣',    label: 'Marketing' },
  { key: 'legal',     emoji: '📋',    label: 'Legal'     },
  { key: 'support',   emoji: '🎧',    label: 'Support'   },
]

// Lookup map for quick emoji access by preset key
export const AVATAR_PRESET_MAP: Record<string, string> = AVATAR_PRESETS.reduce((acc, p) => {
  acc[p.key] = p.emoji
  return acc
}, {} as Record<string, string>)
