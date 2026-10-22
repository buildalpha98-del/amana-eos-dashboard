import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { assertMeetingAccess } from "@/lib/meeting-access";
import { assertPrivateFileAccess } from "@/lib/private-file-access";
import { privateStorageOptions, privateFileId, uploadPrivateFile } from "@/lib/private-storage";
import { isStoredFileUrl } from "@/lib/blob-proxy";
import { getAI } from "@/lib/ai";
import { generateStructuredAnthropic } from "@/lib/ai-provider/anthropic";
import { generateStructuredGroq } from "@/lib/ai-provider/groq";
import { z } from "zod";
vi.mock("@vercel/blob", () => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
import { put } from "@vercel/blob";
const session = (role = "member") => ({ user: { id: "viewer", role, serviceId: "a" }, expires: "2099" }) as never;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXTAUTH_URL", "https://dashboard.example.test");
  prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "member", serviceId: "a", isCentreAccount: false });
  prismaMock.service.findMany.mockResolvedValue([]);
  prismaMock.userServiceMembership.findMany.mockResolvedValue([]);
  prismaMock.meeting.findUnique.mockResolvedValue({ id: "meeting", serviceIds: ["b"], createdById: "other", attendees: [], isLeadership: false });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("meeting scopes", () => {
  it("denies another centre and mixed-centre meetings", async () => {
    await expect(assertMeetingAccess(session(), "meeting")).rejects.toMatchObject({ status: 404 });
    prismaMock.meeting.findUnique.mockResolvedValue({ serviceIds: ["a", "b"], attendees: [] });
    await expect(assertMeetingAccess(session(), "meeting")).rejects.toMatchObject({ status: 404 });
  });
  it("permits a centre's own non-leadership meeting", async () => {
    prismaMock.meeting.findUnique.mockResolvedValue({ serviceIds: ["a"], attendees: [], isLeadership: false });
    await expect(assertMeetingAccess(session(), "meeting")).resolves.toBeUndefined();
  });
  it("does not let educator attendance override the role boundary", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "staff" });
    await expect(assertMeetingAccess(session("staff"), "meeting")).rejects.toMatchObject({ status: 403 });
    expect(prismaMock.meeting.findUnique).not.toHaveBeenCalled();
  });
  it("denies a stale active session after account deactivation", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ active: false, role: "owner" });
    await expect(assertMeetingAccess(session("owner"), "meeting")).rejects.toMatchObject({ status: 403 });
  });
});

describe("private-file boundary", () => {
  it("does not fall back to the public storage credential", async () => {
    vi.stubEnv("PRIVATE_BLOB_STORE_ID", ""); vi.stubEnv("PRIVATE_BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "synthetic-public-token");
    expect(() => privateStorageOptions()).toThrow(/Private storage/);
    await expect(uploadPrivateFile(Buffer.from("synthetic"), "private.txt", "text/plain", { ownerUserId: "viewer" })).rejects.toMatchObject({ status: 503 });
    expect(put).not.toHaveBeenCalled();
  });
  it("accepts only the configured origin and exact private-file route", () => {
    expect(privateFileId("https://dashboard.example.test/api/private-files/file-1")).toBe("file-1");
    expect(privateFileId("https://attacker.test/api/private-files/file-1")).toBeNull();
    expect(privateFileId("https://dashboard.example.test/api/private-files/file-1?redirect=evil")).toBeNull();
  });
  it("accepts the configured local private proxy without permitting arbitrary HTTP URLs", () => {
    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    expect(isStoredFileUrl("http://localhost:3000/api/private-files/file-1")).toBe(true);
    expect(isStoredFileUrl("http://localhost:3001/api/private-files/file-1")).toBe(false);
    expect(isStoredFileUrl("http://localhost:3000/admin")).toBe(false);
  });
  it("denies a different family even when they know the file ID", async () => {
    await expect(assertPrivateFileAccess({ id: "file", ownerParentId: "family-a" } as never, null, { accountId: "family-b", email: "synthetic@example.test" } as never)).rejects.toMatchObject({ status: 404 });
  });
  it("allows the uploading family through a validated parent session", async () => {
    await expect(assertPrivateFileAccess({ ownerParentId: "family-a" } as never, null, { accountId: "family-a" } as never)).resolves.toBeUndefined();
  });
  it("denies an uploader who has moved away from the child's centre", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "staff", serviceId: "a", isCentreAccount: false });
    prismaMock.child.findUnique.mockResolvedValue({ serviceId: "b" });
    await expect(assertPrivateFileAccess({ ownerUserId: "viewer", childId: "child" } as never, session("staff"), null)).rejects.toMatchObject({ status: 404 });
  });
  it("does not treat an uploaded meeting file as personal uploader access", async () => {
    await expect(assertPrivateFileAccess({ ownerUserId: "viewer", meetingId: "meeting" } as never, session(), null)).rejects.toMatchObject({ status: 404 });
  });
});

describe("external AI boundary", () => {
  it("blocks every central text provider before network activity even with configured API keys", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "synthetic-key"); vi.stubEnv("GROQ_API_KEY", "synthetic-key");
    const network = vi.fn(); vi.stubGlobal("fetch", network);
    const options = { system: "Synthetic test", prompt: "Sensitive synthetic content", schema: z.object({}) };
    expect(() => getAI()).toThrow(/blocked/);
    await expect(generateStructuredAnthropic("test", options)).rejects.toMatchObject({ status: 403 });
    await expect(generateStructuredGroq("test", options)).rejects.toMatchObject({ status: 403 });
    expect(network).not.toHaveBeenCalled();
  });
});
