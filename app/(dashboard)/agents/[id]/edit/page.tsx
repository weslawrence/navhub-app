'use client'

import { useParams } from 'next/navigation'
import AgentForm from '../../_form'

export default function EditAgentPage() {
  const params = useParams<{ id: string }>()
  return <AgentForm mode="edit" agentId={params.id} />
}
