import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { resolveResetToken } from '@/lib/password-reset'
import { ResetPasswordForm } from './reset-password-form'

export const dynamic = 'force-dynamic'

// Next 16: searchParams is a Promise and must be awaited.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await auth()
  if (session?.user) redirect('/dashboard')

  const raw = (await searchParams).token
  const token = Array.isArray(raw) ? raw[0] : raw

  // Checked here (without consuming) so an expired link shows a real message
  // instead of a form that fails only on submit.
  const valid = Boolean(token && (await resolveResetToken(token)))

  return <ResetPasswordForm token={token ?? ''} valid={valid} />
}
