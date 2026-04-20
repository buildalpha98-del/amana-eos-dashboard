/**
 * Auth mock utilities for API route tests.
 *
 * Usage:
 *   import { mockSession, mockNoSession } from "../helpers/auth-mock";
 *
 *   // Authenticated as owner
 *   mockSession({ id: "user-1", name: "Test", role: "owner" });
 *
 *   // Unauthenticated
 *   mockNoSession();
 */

import { vi } from "vitest";

export type MockUserRole =
  | "owner"
  | "head_office"
  | "admin"
  | "marketing"
  | "coordinator"
  | "member"
  | "staff";

interface MockUser {
  id: string;
  name: string;
  email?: string;
  role: MockUserRole;
  serviceId?: string | null;
}

// Mock next-auth/next (getServerSession)
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

// Also mock the authOptions import so server-auth doesn't crash
vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

import { getServerSession } from "next-auth";

const mockedGetServerSession = vi.mocked(getServerSession);

/**
 * Mock an authenticated session with the given user.
 */
export function mockSession(user: MockUser) {
  mockedGetServerSession.mockResolvedValue({
    user: {
      id: user.id,
      name: user.name,
      email: user.email ?? `${user.id}@test.com`,
      role: user.role,
      serviceId: user.serviceId ?? null,
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as any);
}

/**
 * Mock an unauthenticated session (no user).
 */
export function mockNoSession() {
  mockedGetServerSession.mockResolvedValue(null);
}
