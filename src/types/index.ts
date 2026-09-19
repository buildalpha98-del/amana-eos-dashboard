import type { Role, InductionStatus } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
      serviceId?: string | null;
      state?: string | null;
      image?: string | null;
      inductionStatus?: InductionStatus | string;
      inductionGraceUntil?: string | Date | null;
      /** Is there a published essential curriculum? See `hasPublishedEssentials`. */
      essentialsPublished?: boolean;
    };
  }

  interface User {
    id: string;
    name: string;
    email: string;
    role: Role;
    serviceId?: string | null;
    state?: string | null;
    inductionStatus?: InductionStatus | string;
    inductionGraceUntil?: string | Date | null;
    essentialsPublished?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    serviceId?: string | null;
    state?: string | null;
    inductionStatus?: InductionStatus | string;
    inductionGraceUntil?: string | Date | null;
    /**
     * Whether any essential course is published. Carried on the token so
     * middleware (Edge runtime, no Prisma) can decide locked-mode without a
     * database round trip, exactly like inductionStatus.
     */
    essentialsPublished?: boolean;
  }
}
