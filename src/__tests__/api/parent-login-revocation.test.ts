import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";
import { POST } from "@/app/api/parent/auth/login/route";

const state = vi.hoisted(() => ({ version: 2 }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));
vi.mock("@/lib/parent-account", () => ({
  normaliseEmail: (email: string) => email.toLowerCase(),
  // The password was validated against version 2, before a concurrent reset.
  authenticateParent: vi.fn(async () => ({ accountId: "parent", email: "parent@example.test", name: "Parent", sessionVersion: 2 })),
  findEnrolmentIdsForEmail: vi.fn(async () => ({ enrolmentIds: [], parentName: null })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PARENT_JWT_SECRET = "isolated-parent-login-test-secret-32-chars";
  prismaMock.parentAccount.findUnique.mockImplementation(async () => ({ id: "parent", email: "parent@example.test", deactivatedAt: null, sessionVersion: state.version }));
});
describe("password login revocation during an in-flight request", () => {
  it.each([2, 3])("only issues a session if the password's observed version is still current (%s)", async version => {
    state.version = version;
    const response = await POST(createRequest("POST", "/api/parent/auth/login", { body: { email: "parent@example.test", password: "old-password" } }));
    expect(response.status).toBe(version === 2 ? 200 : 401);
    expect(response.cookies.has("parent-session")).toBe(version === 2);
  });
});
