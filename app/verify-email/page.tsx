import Link from 'next/link'
import { consumeVerificationToken } from '@/lib/email-verification'
import { Button } from '@/components/ui/button'
import { GraduationCap, CheckCircle2, XCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

// Next 16: searchParams is a Promise and must be awaited.
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const raw = (await searchParams).token
  const token = Array.isArray(raw) ? raw[0] : raw
  const ok = token ? await consumeVerificationToken(token) : false

  return (
    <div className="min-h-screen flex items-center justify-center p-4 hero-gradient">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <GraduationCap className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Shule <span className="text-primary">SMS</span>
          </h1>
        </div>

        <div className="bg-card rounded-xl p-6 shadow-lg border space-y-4">
          {ok ? (
            <>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <h2 className="font-display text-xl font-semibold">Email confirmed</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Your account is active. You can sign in now.
              </p>
              <Button asChild className="w-full"><Link href="/login">Sign in</Link></Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-destructive" />
                <h2 className="font-display text-xl font-semibold">Link not valid</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                This confirmation link is invalid, already used, or older than 24 hours.
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">Back to sign in</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
