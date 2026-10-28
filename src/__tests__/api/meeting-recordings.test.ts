import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));
import { POST, GET } from "@/app/api/meetings/[id]/recordings/route";
import { POST as REGENERATE } from "@/app/api/meetings/[id]/recordings/[recordingId]/regenerate/route";
const ctx = { params: Promise.resolve({ id: "meeting", recordingId: "recording" }) };
beforeEach(() => {
  vi.clearAllMocks(); _clearUserActiveCache();
  mockSession({ id: "owner", name: "Synthetic owner", role: "owner" });
  prismaMock.user.findUnique.mockResolvedValue({ id: "owner", active: true, role: "owner" });
  prismaMock.meeting.findUnique.mockResolvedValue({ id: "meeting", serviceIds: [], attendees: [], createdById: "owner" });
  prismaMock.meetingRecording.findMany.mockResolvedValue([{ id: "recording", transcriptText: "Synthetic private notes" }]);
});
describe("meeting transcript privacy", () => {
  it("requires authentication", async () => {
    mockNoSession();
    expect((await GET(createRequest("GET", "/api/meetings/meeting/recordings"), ctx)).status).toBe(401);
  });
  it.each(["staff", "volunteer"] as const)("refuses %s before reading transcripts", async role => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true, role });
    mockSession({ id: "person", name: "Synthetic person", role });
    expect((await GET(createRequest("GET", "/api/meetings/meeting/recordings"), ctx)).status).toBe(403);
    expect(prismaMock.meetingRecording.findMany).not.toHaveBeenCalled();
  });
  it("permits the owner, with no-store responses", async () => {
    const res = await GET(createRequest("GET", "/api/meetings/meeting/recordings"), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
  it("blocks external transcription without creating or deleting anything", async () => {
    const res = await POST(createRequest("POST", "/api/meetings/meeting/recordings", { body: { url: "https://example.test/stolen-file", source: "upload" } }), ctx);
    expect(res.status).toBe(403);
    expect(prismaMock.meetingRecording.create).not.toHaveBeenCalled();
  });
  it("blocks AI regeneration before claiming the record", async () => {
    const res = await REGENERATE(createRequest("POST", "/api/meetings/meeting/recordings/recording/regenerate"), ctx);
    expect(res.status).toBe(403);
    expect(prismaMock.meetingRecording.updateMany).not.toHaveBeenCalled();
  });
});
