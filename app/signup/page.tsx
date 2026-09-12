import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { isStandalone } from '@/lib/edition'
import { SignupForm } from './signup-form'

export default async function SignupPage() {
  // A standalone school's accounts are created by the office, not self-served.
  if (isStandalone()) notFound()
  const session = await auth()
  if (session?.user) redirect('/dashboard')
  return <SignupForm />
}
