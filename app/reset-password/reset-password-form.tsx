'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GraduationCap, Lock, CheckCircle2, XCircle } from 'lucide-react'

export function ResetPasswordForm({ token, valid }: { token: string; valid: boolean }) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const mismatch = confirm.length > 0 && password !== confirm

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d?.error ?? 'Could not reset the password'); return }
      setDone(true)
      setTimeout(() => router.replace('/login'), 2500)
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

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

        <div className="bg-card rounded-xl p-6 shadow-lg border">
          {!valid ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-destructive" />
                <h2 className="font-display text-xl font-semibold">Link expired</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                This reset link is invalid, already used, or older than 60 minutes.
              </p>
              <Button asChild className="w-full">
                <Link href="/forgot-password">Request a new link</Link>
              </Button>
            </div>
          ) : done ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <h2 className="font-display text-xl font-semibold">Password changed</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                You can now sign in with your new password. Taking you to the sign-in page…
              </p>
              <Button asChild className="w-full"><Link href="/login">Sign in</Link></Button>
            </div>
          ) : (
            <>
              <h2 className="font-display text-xl font-semibold mb-2">Choose a new password</h2>
              <p className="text-muted-foreground text-sm mb-6">At least 8 characters.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password" type="password" value={password} minLength={8} required
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                      placeholder="••••••••" className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirm" type="password" value={confirm} minLength={8} required
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)}
                      placeholder="••••••••" className="pl-10"
                    />
                  </div>
                  {mismatch && <p className="text-destructive text-xs">Passwords do not match</p>}
                </div>
                {error && <p className="text-destructive text-sm">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading || mismatch || password.length < 8}>
                  {loading ? 'Saving…' : 'Set new password'}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
