import { prisma } from "@/lib/prisma";
import type { Role, User } from "@prisma/client";
import { hashSync } from "bcryptjs";

export interface TestSession {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    serviceId: string | null;
  };
  expires: string;
}

const DEFAULT_PASSWORD = "TestPassword123!";

/**
 * Create a test user in the database and return a NextAuth-compatible session.
 */
export async function createTestUser(
  role: Role,
  overrides?: Partial<Pick<User, "name" | "email" | "serviceId" | "state">>,
): Promise<{ user: User; session: TestSession }> {
  const suffix = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const user = await prisma.user.create({
    data: {
      name: overrides?.name ?? `Test ${role}`,
      email: overrides?.email ?? `test-${suffix}@amana-test.local`,
      passwordHash: hashSync(DEFAULT_PASSWORD, 10),
      role,
      serviceId: overrides?.serviceId ?? null,
      state: overrides?.state ?? "NSW",
    },
  });

  const session: TestSession = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      serviceId: user.serviceId,
    },
    expires: new Date(Date.now() + 86400_000).toISOString(),
  };

  return { user, session };
}
