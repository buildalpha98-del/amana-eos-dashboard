import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { NextRequest } from "next/server";

import { authenticateApiKey, hashApiKey, API_SCOPES } from "@/lib/api-key-auth";

function makeRequest(token?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return new NextRequest("http://localhost:3000/api/test", { headers });
}

const VALID_TOKEN = "test-api-key-12345";
const VALID_HASH = hashApiKey(VALID_TOKEN);

const validKeyRecord = {
  id: "key-1",
  name: "Test Key",
  scopes: ["programs:write", "programs:read"],
  createdById: "user-1",
  revokedAt: null,
  expiresAt: null,
};

describe("hashApiKey", () => {
  it("produces a deterministic SHA-256 hex hash", () => {
    const hash1 = hashApiKey("test");
    const hash2 = hashApiKey("test");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it("different inputs produce different hashes", () => {
    expect(hashApiKey("key-a")).not.toBe(hashApiKey("key-b"));
  });
});

describe("authenticateApiKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no Authorization header is present", async () => {
    const req = makeRequest();
    const { apiKey, error } = await authenticateApiKey(req, "programs:read");

    expect(apiKey).toBeNull();
    expect(error).not.toBeNull();
    const body = await error!.json();
    expect(error!.status).toBe(401);
    expect(body.message).toContain("Missing");
  });

  it("returns 401 when token is not a Bearer token", async () => {
    const req = new NextRequest("http://localhost:3000/api/test", {
      headers: { Authorization: "Basic abc123" },
    });
    const { apiKey, error } = await authenticateApiKey(req, "programs:read");

    expect(apiKey).toBeNull();
    expect(error!.status).toBe(401);
  });

  it("returns 401 when API key is not found in database", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(null);

    const req = makeRequest("unknown-key");
    const { apiKey, error } = await authenticateApiKey(req, "programs:read");

    expect(apiKey).toBeNull();
    expect(error!.status).toBe(401);
    const body = await error!.json();
    expect(body.message).toContain("Invalid");
  });

  it("returns 401 when API key has been revoked", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      ...validKeyRecord,
      revokedAt: new Date("2026-01-01"),
    });

    const req = makeRequest(VALID_TOKEN);
    const { apiKey, error } = await authenticateApiKey(req, "programs:read");

    expect(apiKey).toBeNull();
    expect(error!.status).toBe(401);
    const body = await error!.json();
    expect(body.message).toContain("revoked");
  });

  it("returns 401 when API key has expired", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      ...validKeyRecord,
      expiresAt: new Date("2020-01-01"), // expired
    });

    const req = makeRequest(VALID_TOKEN);
    const { apiKey, error } = await authenticateApiKey(req, "programs:read");

    expect(apiKey).toBeNull();
    expect(error!.status).toBe(401);
    const body = await error!.json();
    expect(body.message).toContain("expired");
  });

  it("returns 403 when API key lacks required scope", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(validKeyRecord);

    const req = makeRequest(VALID_TOKEN);
    const { apiKey, error } = await authenticateApiKey(req, "financials:read");

    expect(apiKey).toBeNull();
    expect(error!.status).toBe(403);
    const body = await error!.json();
    expect(body.message).toContain("financials:read");
  });

  it("returns apiKey when token is valid with correct scope", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(validKeyRecord);
    prismaMock.apiKey.update.mockResolvedValue({});

    const req = makeRequest(VALID_TOKEN);
    const { apiKey, error } = await authenticateApiKey(req, "programs:write");

    expect(error).toBeNull();
    expect(apiKey).not.toBeNull();
    expect(apiKey!.id).toBe("key-1");
    expect(apiKey!.name).toBe("Test Key");
    expect(apiKey!.scopes).toContain("programs:write");
  });

  it("looks up key by SHA-256 hash", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(validKeyRecord);
    prismaMock.apiKey.update.mockResolvedValue({});

    const req = makeRequest(VALID_TOKEN);
    await authenticateApiKey(req, "programs:read");

    expect(prismaMock.apiKey.findUnique).toHaveBeenCalledWith({
      where: { keyHash: VALID_HASH },
      select: expect.objectContaining({
        id: true,
        scopes: true,
        revokedAt: true,
        expiresAt: true,
      }),
    });
  });

  it("fires-and-forgets a lastUsedAt update on success", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(validKeyRecord);
    prismaMock.apiKey.update.mockResolvedValue({});

    const req = makeRequest(VALID_TOKEN);
    await authenticateApiKey(req, "programs:read");

    expect(prismaMock.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "key-1" },
        data: expect.objectContaining({ lastUsedAt: expect.any(Date) }),
      }),
    );
  });

  it("allows non-expired key with future expiresAt", async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      ...validKeyRecord,
      expiresAt: new Date("2030-01-01"),
    });
    prismaMock.apiKey.update.mockResolvedValue({});

    const req = makeRequest(VALID_TOKEN);
    const { error } = await authenticateApiKey(req, "programs:read");

    expect(error).toBeNull();
  });
});

describe("API_SCOPES", () => {
  it("contains expected critical scopes", () => {
    expect(API_SCOPES).toContain("programs:write");
    expect(API_SCOPES).toContain("programs:read");
    expect(API_SCOPES).toContain("enquiries:write");
    expect(API_SCOPES).toContain("hr:read");
    expect(API_SCOPES).toContain("billing:read");
    expect(API_SCOPES).toContain("financials:read");
    expect(API_SCOPES).toContain("operations:write");
    expect(API_SCOPES).toContain("partnerships:read");
  });

  it("has no duplicate scopes", () => {
    const unique = new Set(API_SCOPES);
    expect(unique.size).toBe(API_SCOPES.length);
  });
});
