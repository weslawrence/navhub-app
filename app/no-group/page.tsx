'use client'

import { signOut } from '@/app/(auth)/actions'
import { Button }  from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function NoGroupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* NavHub wordmark */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Nav<span style={{ color: 'var(--group-primary, #0ea5e9)' }}>Hub</span>
          </h1>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm font-semibold text-center text-foreground">
              No group access
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Your account isn&apos;t linked to a group yet. Contact your administrator
              to receive an invite.
            </p>
            <form action={signOut}>
              <Button type="submit" variant="outline" className="w-full">
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
