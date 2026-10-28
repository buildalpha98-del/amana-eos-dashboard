import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));
vi.mock("@/lib/private-storage", () => ({ uploadPrivateFile: vi.fn(), deletePrivateFile: vi.fn() }));
import { uploadPrivateFile, deletePrivateFile } from "@/lib/private-storage";
import { POST } from "@/app/api/meetings/[id]/transcripts/route";
const ctx = { params: Promise.resolve({ id: "meeting" }) };
const request = (text = "Synthetic meeting notes") => createRequest("POST", "/api/meetings/meeting/transcripts", { body: { text } });
beforeEach(() => {
  vi.clearAllMocks(); _clearUserActiveCache();
  mockSession({ id: "owner", name: "Synthetic owner", role: "owner" });
  prismaMock.user.findUnique.mockResolvedValue({ id: "owner", active: true, role: "owner" });
  prismaMock.meeting.findUnique.mockResolvedValue({ id: "meeting", serviceIds: [], attendees: [], createdById: "owner" });
  vi.mocked(uploadPrivateFile).mockResolvedValue({ url: "https://example.test/api/private-files/file", size: 23 });
  vi.mocked(deletePrivateFile).mockResolvedValue(true);
  prismaMock.meetingRecording.create.mockResolvedValue({ id: "recording" });
  prismaMock.activityLog.create.mockResolvedValue({ id: "audit" });
  prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock));
});
describe("manual private transcripts", () => {
  it("saves privately with meeting scope and an audit before returning the link", async () => {
    const response = await POST(request(), ctx);
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(uploadPrivateFile).toHaveBeenCalledWith(Buffer.from("Synthetic meeting notes"), "meeting-transcript.txt", "text/plain", { meetingId: "meeting", ownerUserId: "owner" });
    expect(prismaMock.meetingRecording.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ transcriptFileUrl: "https://example.test/api/private-files/file" }) }));
    expect(prismaMock.activityLog.create).toHaveBeenCalledOnce();
  });
  it("refuses educators before uploading content", async () => {
    mockSession({ id: "educator", name: "Synthetic educator", role: "staff" });
    prismaMock.user.findUnique.mockResolvedValue({ active: true, role: "staff" });
    expect((await POST(request(), ctx)).status).toBe(403);
    expect(uploadPrivateFile).not.toHaveBeenCalled();
  });
  it("refuses empty transcripts before storage", async () => {
    expect((await POST(request("   "), ctx)).status).toBe(400);
    expect(uploadPrivateFile).not.toHaveBeenCalled();
  });
  it("removes the uploaded file and releases no link when auditing fails", async () => {
    prismaMock.activityLog.create.mockRejectedValue(new Error("Synthetic audit failure"));
    const response = await POST(request(), ctx);
    expect(response.status).toBe(500);
    expect(deletePrivateFile).toHaveBeenCalledWith("https://example.test/api/private-files/file");
    expect(await response.text()).not.toContain("private-files/file");
  });
});
