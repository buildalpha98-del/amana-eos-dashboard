import { type NextAuthOptions } from "next-auth";
import { NextRequest } from "next/server";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { hasPublishedEssentials } from "@/lib/induction-essentials";
import { getOrgSettings } from "@/lib/org-settings";
import { logAuditEvent } from "@/lib/audit-log";
import { decryptSecret, verifyTotp, verifyBackupCode } from "@/lib/totp";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        mfaCode: { label: "Authentication or backup code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        // Rate limit by email — 5 attempts per 15 minutes
        const rateLimitKey = `login:${credentials.email.toLowerCase()}`;
        const { limited, resetIn } = await checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
        if (limited) {
          const minutes = Math.ceil(resetIn / 60000);
          throw new Error(`Too many login attempts. Please try again in ${minutes} minutes.`);
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user || !user.active) {
          throw new Error("Invalid email or password");
        }

        const isValid = await compare(credentials.password, user.passwordHash);
        if (!isValid) {
          throw new Error("Invalid email or password");
        }

        if (user.mfaEnabledAt) {
          const code = credentials.mfaCode?.trim().toLowerCase();
          if (!code) throw new Error("MFA_REQUIRED");
          if (!user.mfaSecret) throw new Error("Invalid verification code");

          if (/^\d{6}$/.test(code)) {
            if (!verifyTotp(decryptSecret(user.mfaSecret), code)) {
              throw new Error("Invalid verification code");
            }
          } else if (/^[0-9a-f]{8}$/.test(code)) {
            const { valid, remainingHashes } = verifyBackupCode(code, user.mfaBackupCodes);
            if (!valid) throw new Error("Invalid verification code");
            // Compare-and-set: simultaneous logins cannot reuse a backup code.
            const consumed = await prisma.user.updateMany({
              where: {
                id: user.id,
                active: true,
                tokenVersion: user.tokenVersion,
                mfaSecret: user.mfaSecret,
                mfaBackupCodes: { equals: user.mfaBackupCodes },
              },
              data: { mfaBackupCodes: remainingHashes },
            });
            if (consumed.count !== 1) throw new Error("Invalid verification code");
          } else {
            throw new Error("Invalid verification code");
          }
        }

        // Successful login — reset rate limit & track login time
        await resetRateLimit(rateLimitKey);
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          serviceId: user.serviceId,
          state: user.state,
          tokenVersion: user.tokenVersion,
          inductionStatus: user.inductionStatus,
          inductionGraceUntil: user.inductionGraceUntil,
          isCentreAccount: user.isCentreAccount,
          mustChangePassword: user.mustChangePassword,
          mfaRequired: !!user.mfaEnabledAt,
          mfaVerified: !!user.mfaEnabledAt,
          mfaEnabledAt: user.mfaEnabledAt?.toISOString() ?? null,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days max (remember-me), actual expiry handled in jwt callback
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.serviceId = user.serviceId;
        token.state = user.state;
        token.loginAt = Date.now();
        token.tokenVersion = (user as unknown as Record<string, unknown>).tokenVersion ?? 0;
        token.inductionStatus =
          ((user as unknown as Record<string, unknown>).inductionStatus as string) ?? "cleared";
        token.inductionGraceUntil =
          ((user as unknown as Record<string, unknown>).inductionGraceUntil as
            | string
            | Date
            | null) ?? null;
        // Whether there is a curriculum to be gated on at all. Without this
        // the lock fires against an empty course list — see induction-lock.ts.
        token.essentialsPublished = await hasPublishedEssentials();
        token.isCentreAccount =
          (user as unknown as Record<string, unknown>).isCentreAccount === true;
        // Someone else chose this password — middleware holds the user on
        // /set-password until they choose their own.
        token.mustChangePassword =
          (user as unknown as Record<string, unknown>).mustChangePassword === true;
        token.mfaRequired = (user as unknown as Record<string, unknown>).mfaRequired ?? false;
        token.mfaVerified = (user as unknown as Record<string, unknown>).mfaVerified === true;
        token.mfaEnabledAt = (user as unknown as Record<string, unknown>).mfaEnabledAt ?? null;

        // Read remember-me preference set during login
        try {
          const cookieStore = await cookies();
          const rememberMe = cookieStore.get("remember-me")?.value === "true";
          token.rememberMe = rememberMe;
        } catch {
          token.rememberMe = false;
        }
      }

      // Enforce short session (24h) when remember-me is off
      if (token.loginAt && !token.rememberMe) {
        const elapsed = Date.now() - (token.loginAt as number);
        const ONE_DAY = 24 * 60 * 60 * 1000;
        if (elapsed > ONE_DAY) {
          throw new Error("Session expired");
        }
      }

      // NextAuth's JWT encoder replaces exp, so invalid sessions must throw.
      // Its session handler then returns no identity and clears the cookie.
      if (!token.id || typeof token.tokenVersion !== "number" || typeof token.loginAt !== "number") {
        throw new Error("Invalid session");
      }
      // Check revocation on every server session read, including sessions whose
      // expensive page/induction metadata was refreshed only moments ago.
      const dbUser = await prisma.user.findUnique({
        where: { id: token.id },
        select: {
          tokenVersion: true, active: true, role: true, serviceId: true,
          state: true, inductionStatus: true, inductionGraceUntil: true,
          isCentreAccount: true, mfaEnabledAt: true,
        },
      });
      if (!dbUser || !dbUser.active || dbUser.tokenVersion !== token.tokenVersion) {
        throw new Error("Session revoked");
      }
      if (dbUser.mfaEnabledAt && (
        token.mfaVerified !== true ||
        token.mfaEnabledAt !== dbUser.mfaEnabledAt.toISOString()
      )) {
        throw new Error("MFA verification required");
      }
      const identityChanged = token.role !== dbUser.role;
      token.role = dbUser.role;
      token.serviceId = dbUser.serviceId;
      token.state = dbUser.state;
      token.inductionStatus = dbUser.inductionStatus;
      token.inductionGraceUntil = dbUser.inductionGraceUntil;
      token.isCentreAccount = dbUser.isCentreAccount;

      const lastCheck = (token.tokenVersionCheckedAt as number) ?? 0;
      if (identityChanged || Date.now() - lastCheck > 5 * 60 * 1000) {
        token.tokenVersionCheckedAt = Date.now();
        token.essentialsPublished = await hasPublishedEssentials();
        const settings = await getOrgSettings();
        const roleKey = token.role as keyof typeof settings.rolePageOverrides;
        token.rolePageOverride = settings.rolePageOverrides?.[roleKey] ?? null;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.serviceId = token.serviceId;
        session.user.state = token.state;
        session.user.inductionStatus = token.inductionStatus as string | undefined;
        session.user.isCentreAccount = token.isCentreAccount === true;
        session.user.inductionGraceUntil =
          (token.inductionGraceUntil as string | null | undefined) ?? null;
        session.user.essentialsPublished = token.essentialsPublished as
          | boolean
          | undefined;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      // Feed the "Recent Login Sessions" panel (/api/auth/sessions reads
      // SecurityAuditLog rows with action "user.login"). Never let a logging
      // failure block sign-in — logAuditEvent is fire-and-forget, and the
      // try/catch guards against anything synchronous going wrong.
      try {
        // Best-effort request context — same pattern as the remember-me
        // cookie read in the jwt callback (headers() is available in the
        // auth route's request scope). logAuditEvent extracts ip/userAgent
        // from the request's headers, which is what the "Recent Login
        // Sessions" panel (/api/auth/sessions) displays.
        let req: NextRequest | undefined;
        try {
          const h = await headers();
          req = new NextRequest("http://internal/api/auth/signin", {
            headers: h,
          });
        } catch {
          // Outside a request scope — record the login without ip/userAgent.
        }

        logAuditEvent(
          {
            action: "user.login",
            actorId: user.id,
            actorEmail: user.email ?? null,
            targetId: user.id,
            targetType: "User",
            metadata: { provider: "credentials" },
          },
          req
        );
      } catch {
        // Swallow — sign-in must never fail because audit logging did.
      }
    },
  },
  pages: {
    signIn: "/login",
  },
};
