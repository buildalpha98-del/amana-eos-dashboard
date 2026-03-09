import type { Role } from "@prisma/client";

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
    };
  }

  interface User {
    id: string;
    name: string;
    email: string;
    role: Role;
    serviceId?: string | null;
    state?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    serviceId?: string | null;
    state?: string | null;
  }
}
