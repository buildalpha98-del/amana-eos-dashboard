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

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
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
          mfaRequired: !!user.mfaEnabledAt,
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
        token.mfaRequired = (user as unknown as Record<string, unknown>).mfaRequired ?? false;
        token.mfaVerified = false;

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
          return { ...token, exp: 0 }; // Force token expiry
        }
      }

      // Validate tokenVersion against database (checked periodically) and
      // refresh the identity fields that drive access: role, serviceId,
      // state, induction, and the role-page-access override. Piggybacking
      // the 5-minute window means an admin's permission change propagates
      // to active sessions within ~5 min without a re-login.
      //
      // 2026-09-15: role / serviceId / state used to be written ONLY in the
      // `if (user)` sign-in branch above, so this comment was a promise the
      // code didn't keep. Promoting someone to State Manager left them a
      // Member in their own browser until they happened to log out — and,
      // worse in the other direction, REVOKING an admin's role changed
      // nothing about their live session. Neither a PATCH to /api/users nor
      // this refresh touched token.role, and nothing bumped tokenVersion on
      // a role change either, so there was no path at all from a role
      // change to an active session.
      if (token.id && typeof token.tokenVersion === "number") {
        const lastCheck = (token.tokenVersionCheckedAt as number) ?? 0;
        const FIVE_MINUTES = 5 * 60 * 1000;
        if (Date.now() - lastCheck > FIVE_MINUTES) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.id as string },
              select: {
                tokenVersion: true,
                active: true,
                role: true,
                serviceId: true,
                state: true,
                inductionStatus: true,
                inductionGraceUntil: true,
              },
            });
            if (!dbUser || !dbUser.active || dbUser.tokenVersion !== token.tokenVersion) {
              return { ...token, exp: 0 }; // Force token expiry
            }
            token.tokenVersionCheckedAt = Date.now();
            // Role, centre and state decide what the middleware, the nav and
            // every `session.user.role` check allow. Refreshed BEFORE the
            // override lookup below, which is keyed on the role — reading a
            // stale role there would hand a just-promoted user the previous
            // role's page overrides for another five minutes.
            token.role = dbUser.role;
            token.serviceId = dbUser.serviceId;
            token.state = dbUser.state;
            // Refresh induction fields so locked-mode lifts within ~5 min of
            // a learner clearing (the gate APIs read the DB live, so clock-in
            // is never stale — only the UI nav lock lags by this window).
            token.inductionStatus = dbUser.inductionStatus;
            token.inductionGraceUntil = dbUser.inductionGraceUntil;
            // Re-read on the same cadence so publishing the first essential
            // course starts gating new starters within ~5 min, and un-publishing
            // (or a fresh org with no curriculum) lifts the lock just as fast.
            token.essentialsPublished = await hasPublishedEssentials();

            // Refresh the page-access override for this user's role.
            // Null = use compile-time defaults (kept in token so the
            // middleware can act without an extra DB lookup).
            try {
              const settings = await getOrgSettings();
              const roleKey = token.role as keyof typeof settings.rolePageOverrides;
              const override = settings.rolePageOverrides?.[roleKey];
              token.rolePageOverride = override ?? null;
            } catch {
              // Don't fail the token refresh if org-settings is
              // unreachable — leave the previous value in place.
            }
          } catch {
            // DB unavailable — allow token to continue
          }
        }
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
