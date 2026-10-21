/**
 * Direct-upload tokens (security brief batch 1, 2026-10-21): a recording's
 * audio is deleted after transcription, so recording tokens are only issued
 * for the uploader's own `recordings/<userId>/` folder, and the ordinary
 * lane may not write into `recordings/` at all.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 9, resetIn: 0 })) }));

type Before = (pathname: string, clientPayload: string | null) => Promise<Record<string, unknown>>;
const blob = vi.hoisted(() => ({ issued: [] as Record<string, unknown>[], pathname: "", payload: null as string | null }));
vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn(async ({ onBeforeGenerateToken }: { onBeforeGenerateToken: Before }) => {
    blob.issued.push(await onBeforeGenerateToken(blob.pathname, blob.payload));
    return { type: "blob.generate-client-token", clientToken: "synthetic-token" };
  }),
}));

import { POST } from "@/app/api/upload/blob-token/route";

const ask = (pathname: string, context?: "recording") => {
  blob.pathname = pathname;
  blob.payload = context ? JSON.stringify({ context }) : null;
  return POST(createRequest("POST", "/api/upload/blob-token", { body: { type: "blob.generate-client-token", payload: {} } }));
};

beforeEach(() => {
  _clearUserActiveCache();
  vi.clearAllMocks();
  blob.issued = [];
  mockSession({ id: "u1", name: "Synthetic educator", role: "staff", serviceId: "centre-a" });
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
});

describe("direct-upload tokens", () => {
  it("issues a recording token for the uploader's own folder", async () => {
    expect((await ask("recordings/u1/l10.webm", "recording")).status).toBe(200);
    expect(blob.issued[0]).toMatchObject({ addRandomSuffix: true, tokenPayload: JSON.stringify({ userId: "u1" }) });
  });

  it.each([
    ["someone else's folder", "recordings/u2/l10.webm"],
    ["the bucket root", "l10.webm"],
    ["a climb out of the folder", "recordings/u1/../u2/l10.webm"],
  ])("refuses a recording token for %s", async (_label, path) => {
    expect((await ask(path, "recording")).status).toBe(400);
    expect(blob.issued).toHaveLength(0);
  });

  it("keeps ordinary uploads out of recordings/ but otherwise unchanged", async () => {
    expect((await ask("recordings/u2/fake.webm")).status).toBe(400);
    expect((await ask("scanned-wwcc.pdf")).status).toBe(200);
    expect(blob.issued).toHaveLength(1);
  });
});
