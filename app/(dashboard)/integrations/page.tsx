import { redirect } from 'next/navigation'

// /integrations → moved to Settings > Integrations tab
export default function IntegrationsPage() {
  redirect('/settings?tab=integrations')
}
