import { Bot } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Agents</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure and manage AI agents across your companies. Coming in a future phase.
        </p>
      </div>

      <Card className="max-w-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <Bot className="h-5 w-5 text-muted-foreground" />
              </div>
              <CardTitle className="text-base">AI Agents Module</CardTitle>
            </div>
            <Badge variant="secondary">Coming Soon</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Agents will be able to monitor financial performance, surface anomalies,
            and generate insights across companies and divisions — all scoped to your group.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
