/**
 * Coverage for the `requirePageSession()` helper from `src/lib/server-auth.ts`.
 *
 * Why this matters: the helper replaced 12 hand-rolled copies of
 * `getServerSession + if (!session) redirect("/login")`. If it ever
 * misbehaves we'd silently expose every dashboard page to
 * unauthenticated traffic, so the gate deserves a tiny unit covering
 * the three real states it can be in.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock `next/navigation`'s redirect so we can assert it was called
// without actually throwing the framework's special internal error.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`__redirect:${path}`);
  }),
}));

// Match the auth-mock helper used by API route tests.
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { requirePageSession } from "@/lib/server-auth";

const mockedGetServerSession = vi.mocked(getServerSession);
const mockedRedirect = vi.mocked(redirect);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requirePageSession", () => {
  it("redirects to /login when there is no session", async () => {
    mockedGetServerSession.mockResolvedValue(null);

    await expect(requirePageSession()).rejects.toThrow("__redirect:/login");
    expect(mockedRedirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when the session exists but has no user id", async () => {
    mockedGetServerSession.mockResolvedValue({
      user: { name: "Anonymous" },
      // No `user.id` — simulates a half-built session that should
      // still bounce.
    } as never);

    await expect(requirePageSession()).rejects.toThrow("__redirect:/login");
    expect(mockedRedirect).toHaveBeenCalledWith("/login");
  });

  it("returns the session when a valid user is signed in", async () => {
    const session = {
      user: { id: "u-1", name: "Jayden", role: "owner" },
      expires: "2099-01-01",
    };
    mockedGetServerSession.mockResolvedValue(session as never);

    const result = await requirePageSession();
    expect(result).toBe(session);
    expect(mockedRedirect).not.toHaveBeenCalled();
  });

  it("honours a custom `redirectTo` option", async () => {
    mockedGetServerSession.mockResolvedValue(null);

    await expect(
      requirePageSession({ redirectTo: "/no-access" }),
    ).rejects.toThrow("__redirect:/no-access");
    expect(mockedRedirect).toHaveBeenCalledWith("/no-access");
  });
});
