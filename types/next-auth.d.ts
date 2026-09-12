import { DefaultSession } from 'next-auth';
import { JWT } from 'next-auth/jwt';
import type { UserRole } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      schoolId: string | null;
      locale: string;
      /** Tenant lifecycle, refreshed on every request. */
      schoolActive: boolean;
      subscriptionStatus: string | null;
    } & DefaultSession['user']; // includes name, email, image
  }

  interface User {
    id: string;
    role: UserRole;
    schoolId: string | null;
    locale: string;
    tokenVersion: number;
    schoolActive: boolean;
    subscriptionStatus: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
    schoolId: string | null;
    locale: string;
    /** Compared against User.tokenVersion to invalidate stale sessions. */
    tokenVersion: number;
    schoolActive: boolean;
    subscriptionStatus: string | null;
  }
}
