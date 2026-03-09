import { redirect } from 'next/navigation'

// /companies → moved to Settings > Companies tab
export default function CompaniesPage() {
  redirect('/settings?tab=companies')
}
