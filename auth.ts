import NextAuth, { CredentialsSignin } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import type { UserRole } from '@prisma/client'

/** Lockout policy for the credentials provider. */
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

/** Signals the login form can distinguish, surfaced via `res.code`. */
class AccountLocked extends CredentialsSignin { code = 'account_locked' }
class EmailUnverified extends CredentialsSignin { code = 'email_unverified' }
class SchoolDisabled extends CredentialsSignin { code = 'school_disabled' }

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await prisma.user.findUnique({
          where: { email: String(credentials.email).trim().toLowerCase() },
          include: { school: { select: { isActive: true, subscription: { select: { status: true } } } } },
        })
        if (!user?.hashedPassword || !user.isActive) return null

        // Locked out from earlier failures?
        if (user.lockedUntil && user.lockedUntil > new Date()) throw new AccountLocked()

        const valid = await bcrypt.compare(String(credentials.password), user.hashedPassword)

        if (!valid) {
          const attempts = user.failedLoginAttempts + 1
          const lock = attempts >= MAX_FAILED_ATTEMPTS
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: lock ? 0 : attempts,
              lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
            },
          })
          if (lock) throw new AccountLocked()
          return null
        }

        // Accounts created through public signup must confirm their address.
        if (!user.emailVerified) throw new EmailUnverified()

        // A tenant the platform has switched off cannot be signed into at all.
        // SUPER_ADMIN administers the platform and is deliberately exempt.
        if (user.role !== 'SUPER_ADMIN' && user.school && !user.school.isActive) {
          throw new SchoolDisabled()
        }

        // Successful login clears the failure counter.
        if (user.failedLoginAttempts || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null },
          })
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          schoolId: user.schoolId,
          locale: user.locale,
          image: user.image,
          tokenVersion: user.tokenVersion,
          schoolActive: user.school?.isActive ?? true,
          subscriptionStatus: user.school?.subscription?.status ?? null,
        } as any
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role as UserRole
        token.schoolId = (user as any).schoolId as string | null
        token.locale = (user as any).locale as string
        token.tokenVersion = (user as any).tokenVersion as number
        token.schoolActive = (user as any).schoolActive ?? true
        token.subscriptionStatus = (user as any).subscriptionStatus ?? null
        return token
      }

      // Subsequent requests: re-check the account against the database so a
      // password reset, deactivation or role change takes effect on tokens
      // already issued elsewhere. Returning null invalidates the session.
      if (!token.sub) return null
      const current = await prisma.user.findUnique({
        where: { id: token.sub },
        select: {
          isActive: true, tokenVersion: true, role: true, schoolId: true, locale: true,
          school: { select: { isActive: true, subscription: { select: { status: true } } } },
        },
      })
      if (!current || !current.isActive) return null
      if (current.tokenVersion !== token.tokenVersion) return null
      // Deactivating a tenant ends its live sessions on the next request, the
      // same way a password change does.
      if (current.role !== 'SUPER_ADMIN' && current.school && !current.school.isActive) return null

      // Keep long-lived tokens honest about role/school moves.
      token.role = current.role
      token.schoolId = current.schoolId
      token.locale = current.locale
      // Refreshed every request, so a suspension takes effect immediately.
      token.schoolActive = current.school?.isActive ?? true
      token.subscriptionStatus = current.school?.subscription?.status ?? null
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string
        session.user.role = token.role as UserRole
        session.user.schoolId = token.schoolId as string | null
        session.user.locale = token.locale as string
        session.user.schoolActive = (token.schoolActive as boolean) ?? true
        session.user.subscriptionStatus = (token.subscriptionStatus as string | null) ?? null
      }
      return session
    },
  },
})
