import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { ForgotPasswordForm } from './forgot-password-form'

export default async function ForgotPasswordPage() {
  const session = await auth()
  if (session?.user) redirect('/dashboard')
  return <ForgotPasswordForm />
}
