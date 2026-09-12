'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AuthLayout } from '@/components/layouts/auth-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useI18n } from '@/lib/i18n-context'
import { GraduationCap, Mail, Lock, Globe } from 'lucide-react'
import Link from 'next/link'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [unverified, setUnverified] = useState(false)
  const [resent, setResent] = useState(false)
  // /demo links here with ?email=… so a visitor only types the password.
  useEffect(() => { const e = new URLSearchParams(window.location.search).get('email'); if (e) setEmail(e) }, [])

  const resendVerification = async () => {
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setResent(true)
    } catch { /* the endpoint never reports whether the account exists */ }
  }
  const router = useRouter()
  const { t, locale, setLocale } = useI18n()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })
      if (res?.error) {
        // `code` comes from the CredentialsSignin subclasses thrown in auth.ts.
        if (res.code === 'account_locked') {
          setError('Too many failed attempts. This account is locked for 15 minutes.')
        } else if (res.code === 'school_disabled') {
          setError('This school\'s account has been deactivated. Contact the platform administrator.')
        } else if (res.code === 'email_unverified') {
          setError('Confirm your email address before signing in.')
          setUnverified(true)
        } else {
          setError('Invalid email or password')
        }
      } else {
        router.replace('/dashboard')
      }
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
          <p className="text-muted-foreground mt-1 text-sm">
            School Management System
          </p>
        </div>

        <div className="bg-card rounded-xl p-6 shadow-lg border">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-xl font-semibold">{t('auth.loginTitle')}</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocale(locale === 'en' ? 'sw' : 'en')}
              className="gap-1.5"
            >
              <Globe className="w-4 h-4" />
              {locale === 'en' ? 'SW' : 'EN'}
            </Button>
          </div>
          <p className="text-muted-foreground text-sm mb-6">{t('auth.loginDesc')}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('common.email')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  placeholder="admin@school.tz"
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end -mt-2">
              <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            {unverified && (
              resent ? (
                <p className="text-sm text-muted-foreground">
                  If that account is unconfirmed, a new link has been sent.
                </p>
              ) : (
                <button type="button" onClick={resendVerification} className="text-sm text-primary hover:underline">
                  Resend confirmation email
                </button>
              )
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t('common.loading') : t('common.login')}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {t('auth.noAccount')}{' '}
            <Link href="/signup" className="text-primary font-medium hover:underline">
              {t('common.signup')}
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered by Shule SMS • Tanzania 🇹🇿
        </p>
      </div>
    </div>
  )
}
