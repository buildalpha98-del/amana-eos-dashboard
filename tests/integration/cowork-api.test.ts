/**
 * Integration test: Cowork API authentication and authorization
 *
 * Tests API key authentication with scopes, rate limiting concepts,
 * and the Cowork bearer token auth.
 *
 * Uses mocked Prisma for unit-level validation of auth logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock Prisma before importing
vi.mock("@/lib/prisma", () => {
  const { createPrismaMock } = (() => {
    const cache: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {};
    function createPrismaMock() {
      return new Proxy({} as Record<string, unknown>, {
        get(_target, model: string) {
          if (!cache[model]) {
            cache[model] = new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
              get(mc: Record<string, ReturnType<typeof vi.fn>>, method: string) {
                if (!mc[method]) mc[method] = vi.fn();
                return mc[method];
              },
            });
          }
          return cache[model];
        },
      });
    }
    return { createPrismaMock };
  })();
  return { prisma: createPrismaMock() };
});

import { NextRequest } from "next/server";
import {
  authenticateApiKey,
  hashApiKey,
  API_SCOPES,
  type ApiScope,
} from "@/lib/api-key-auth";
import { prisma } from "@/lib/prisma";

const prismaMock = prisma as any;

function makeCoworkRequest(token?: string, scope?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new NextRequest("http://localhost:3000/api/cowork/programs", { headers });
}

const COWORK_TOKEN = "cowork-api-key-xyz";
const COWORK_HASH = hashApiKey(COWORK_TOKEN);

describe("Cowork API key authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authenticates with programs:write scope", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      id: "cowork-key",
      name: "Cowork Integration",
      scopes: ["programs:write", "programs:read", "announcements:write"],
      allowedIps: [], // empty = allow all; required since schema field is String[] (non-nullable)
      createdById: "user-1",
      revokedAt: null,
      expiresAt: null,
    });
    prismaMock.apiKey.update.mockResolvedValue({});

    const req = makeCoworkRequest(COWORK_TOKEN);
    const { apiKey, error } = await authenticateApiKey(req, "programs:write");

    expect(error).toBeNull();
    expect(apiKey).not.toBeNull();
    expect(apiKey!.scopes).toContain("programs:write");
  });

  it("rejects when key lacks required scope for operation", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      id: "cowork-key",
      name: "Cowork Integration",
      scopes: ["programs:read"], // read-only, no write
      allowedIps: [],
      createdById: "user-1",
      revokedAt: null,
      expiresAt: null,
    });

    const req = makeCoworkRequest(COWORK_TOKEN);
    const { error } = await authenticateApiKey(req, "programs:write");

    expect(error).not.toBeNull();
    expect(error!.status).toBe(403);
  });

  it("validates all cowork-relevant scopes exist", () => {
    const coworkScopes: ApiScope[] = [
      "programs:write",
      "programs:read",
      "announcements:write",
      "announcements:read",
      "marketing:write",
      "marketing:read",
      "enquiries:write",
      "enquiries:read",
      "recruitment:write",
      "recruitment:read",
      "hr:read",
      "billing:read",
      "billing:write",
      "financials:read",
      "operations:read",
      "operations:write",
      "parent-experience:read",
      "parent-experience:write",
      "partnerships:read",
      "partnerships:write",
    ];

    for (const scope of coworkScopes) {
      expect(API_SCOPES).toContain(scope);
    }
  });
});

describe("Cowork bearer token auth (env-based)", () => {
  const originalKey = process.env.COWORK_API_KEY;

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.COWORK_API_KEY = originalKey;
    } else {
      delete process.env.COWORK_API_KEY;
    }
  });

  it("rejects requests without authorization header", async () => {
    process.env.COWORK_API_KEY = "test-cowork-key";

    // Import the Cowork auth module
    const { authenticateCowork } = await import("@/app/api/_lib/auth");

    const req = new NextRequest("http://localhost:3000/api/cowork/programs");
    const result = await authenticateCowork(req);

    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });
});
