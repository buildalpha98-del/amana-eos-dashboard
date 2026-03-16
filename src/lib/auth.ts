import { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";

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

        // Successful login — reset rate limit
        await resetRateLimit(rateLimitKey);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          serviceId: user.serviceId,
          state: user.state,
          tokenVersion: user.tokenVersion,
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

      // Validate tokenVersion against database (checked periodically)
      if (token.id && typeof token.tokenVersion === "number") {
        const lastCheck = (token.tokenVersionCheckedAt as number) ?? 0;
        const FIVE_MINUTES = 5 * 60 * 1000;
        if (Date.now() - lastCheck > FIVE_MINUTES) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.id as string },
              select: { tokenVersion: true, active: true },
            });
            if (!dbUser || !dbUser.active || dbUser.tokenVersion !== token.tokenVersion) {
              return { ...token, exp: 0 }; // Force token expiry
            }
            token.tokenVersionCheckedAt = Date.now();
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
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
