export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/authz'
import { prisma } from '@/lib/db'

/** PUT { locale: 'en' | 'sw' } — remember the UI language on the account. */
export async function PUT(req: Request) {
  const guard = await requireApiUser()
  if (!guard.ok) return guard.response
  const body = await req.json().catch(() => ({}))
  const locale = body?.locale === 'sw' ? 'sw' : body?.locale === 'en' ? 'en' : null
  if (!locale) return NextResponse.json({ error: 'locale must be en or sw' }, { status: 400 })
  await prisma.user.update({ where: { id: guard.userId }, data: { locale } })
  return NextResponse.json({ locale })
}
