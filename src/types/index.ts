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
  }
}
