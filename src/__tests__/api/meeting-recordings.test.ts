import { describe, it, expect, beforeEach, vi } from "vitest";
const sendMeetingDigestSafe = vi.fn();
vi.mock("@/lib/meeting-digest", () => ({
  sendMeetingDigestSafe: (id: string) => sendMeetingDigestSafe(id),
  sendMeetingDigest: vi.fn(),
}));
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession, type MockUserRole } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ limited: false })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

const requestTranscription = vi.fn();
vi.mock("@/lib/deepgram", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    requestTranscription: (args: unknown) => requestTranscription(args),
    buildDeepgramCallbackUrl: () => "https://example.test/api/webhooks/deepgram?secret=s",
  };
});

const deleteFile = vi.fn();
vi.mock("@/lib/storage", () => ({
  deleteFile: (url: string) => deleteFile(url),
}));

const generateMeetingReview = vi.fn();
vi.mock("@/lib/meeting-review", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    generateMeetingReview: (id: string) => generateMeetingReview(id),
  };
});

import { POST as createRecording, GET as listRecordings } from "@/app/api/meetings/[id]/recordings/route";
import { POST as regenerate } from "@/app/api/meetings/[id]/recordings/[recordingId]/regenerate/route";
import { _clearUserActiveCache } from "@/lib/server-auth";

const ctx = { params: Promise.resolve({ id: "m-1" }) };
const regenCtx = { params: Promise.resolve({ id: "m-1", recordingId: "rec-1" }) };
const BLOB_URL = "https://abc123.public.blob.vercel-storage.com/l10.webm";

describe("POST /api/meetings/[id]/recordings", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
    mockSession({ id: "u1", name: "Admin", role: "admin" });
    prismaMock.meeting.findUnique.mockResolvedValue({ id: "m-1" });
    prismaMock.meetingRecording.create.mockResolvedValue({ id: "rec-1" });
    prismaMock.meetingRecording.update.mockResolvedValue({
      id: "rec-1", status: "transcribing", deepgramRequestId: "req-9",
    });
    requestTranscription.mockResolvedValue({ requestId: "req-9" });
  });

  it("401s unauthenticated", async () => {
    mockNoSession();
    const res = await createRecording(
      createRequest("POST", "/api/meetings/m-1/recordings", {
        body: { url: BLOB_URL, source: "live_mic" },
      }),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it.each([["member"], ["staff"], ["eos_viewer"]])(
    "403s for role %s",
    async (role) => {
      prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role });
      mockSession({ id: "u1", name: "U", role: role as MockUserRole });
      const res = await createRecording(
        createRequest("POST", "/api/meetings/m-1/recordings", {
          body: { url: BLOB_URL, source: "live_mic" },
        }),
        ctx,
      );
      expect(res.status).toBe(403);
    },
  );

  it("rejects a non-blob-store URL", async () => {
    const res = await createRecording(
      createRequest("POST", "/api/meetings/m-1/recordings", {
        body: { url: "https://evil.example.com/a.webm", source: "upload" },
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(prismaMock.meetingRecording.create).not.toHaveBeenCalled();
  });

  it("404s for a missing meeting", async () => {
    prismaMock.meeting.findUnique.mockResolvedValue(null);
    const res = await createRecording(
      createRequest("POST", "/api/meetings/m-1/recordings", {
        body: { url: BLOB_URL, source: "live_mic" },
      }),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it("creates the row and requests transcription (uploaded → transcribing)", async () => {
    const res = await createRecording(
      createRequest("POST", "/api/meetings/m-1/recordings", {
        body: { url: BLOB_URL, source: "live_mic", durationSeconds: 3600 },
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect(prismaMock.meetingRecording.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        meetingId: "m-1",
        source: "live_mic",
        status: "uploaded",
        audioBlobUrl: BLOB_URL,
        durationSeconds: 3600,
        createdById: "u1",
      }),
    });
    expect(requestTranscription).toHaveBeenCalledWith({
      audioUrl: BLOB_URL,
      callbackUrl: "https://example.test/api/webhooks/deepgram?secret=s",
    });
    expect(prismaMock.meetingRecording.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: { deepgramRequestId: "req-9", status: "transcribing" },
    });
  });

  it("marks failed + deletes the blob when Deepgram rejects the request", async () => {
    requestTranscription.mockRejectedValue(new Error("dg down"));
    const res = await createRecording(
      createRequest("POST", "/api/meetings/m-1/recordings", {
        body: { url: BLOB_URL, source: "upload" },
      }),
      ctx,
    );
    expect(res.status).toBe(502);
    // Delete-then-null ordering: the URL is only cleared AFTER a
    // successful delete (janitor sweep e3 retries rows still carrying one).
    expect(prismaMock.meetingRecording.update).toHaveBeenNthCalledWith(1, {
      where: { id: "rec-1" },
      data: { status: "failed", error: "dg down" },
    });
    expect(deleteFile).toHaveBeenCalledWith(BLOB_URL);
    expect(prismaMock.meetingRecording.update).toHaveBeenNthCalledWith(2, {
      where: { id: "rec-1" },
      data: { audioBlobUrl: null },
    });
  });
});

describe("GET /api/meetings/[id]/recordings", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "owner" });
    mockSession({ id: "u1", name: "Owner", role: "owner" });
    prismaMock.meetingRecording.findMany.mockResolvedValue([]);
  });

  it("selects everything except the utterance Json", async () => {
    await listRecordings(createRequest("GET", "/api/meetings/m-1/recordings"), ctx);
    const arg = prismaMock.meetingRecording.findMany.mock.calls[0][0] as {
      select: Record<string, unknown>;
    };
    expect(arg.select.transcript).toBeUndefined();
    expect(arg.select.transcriptText).toBe(true);
    expect(arg.select.aiReview).toBe(true);
  });
});

describe("POST .../regenerate", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", active: true, role: "admin" });
    mockSession({ id: "u1", name: "Admin", role: "admin" });
    prismaMock.meetingRecording.findUnique.mockResolvedValue({
      id: "rec-1", meetingId: "m-1", transcript: [{ speaker: 0 }], status: "complete",
    });
    prismaMock.meetingRecording.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.meetingRecording.update.mockResolvedValue({ id: "rec-1", status: "complete" });
    generateMeetingReview.mockResolvedValue({ summary: "s", actionItems: [] });
  });

  it("404s when the recording belongs to another meeting", async () => {
    prismaMock.meetingRecording.findUnique.mockResolvedValue({
      id: "rec-1", meetingId: "m-OTHER", transcript: [{}], status: "complete",
    });
    const res = await regenerate(
      createRequest("POST", "/api/meetings/m-1/recordings/rec-1/regenerate"),
      regenCtx,
    );
    expect(res.status).toBe(404);
  });

  it("409s without a transcript", async () => {
    prismaMock.meetingRecording.findUnique.mockResolvedValue({
      id: "rec-1", meetingId: "m-1", transcript: null, status: "failed",
    });
    const res = await regenerate(
      createRequest("POST", "/api/meetings/m-1/recordings/rec-1/regenerate"),
      regenCtx,
    );
    expect(res.status).toBe(409);
  });

  it("409s when still processing (guarded claim loses)", async () => {
    prismaMock.meetingRecording.updateMany.mockResolvedValue({ count: 0 });
    const res = await regenerate(
      createRequest("POST", "/api/meetings/m-1/recordings/rec-1/regenerate"),
      regenCtx,
    );
    expect(res.status).toBe(409);
    expect(generateMeetingReview).not.toHaveBeenCalled();
  });

  it("re-runs summarisation and stores the review", async () => {
    const res = await regenerate(
      createRequest("POST", "/api/meetings/m-1/recordings/rec-1/regenerate"),
      regenCtx,
    );
    expect(res.status).toBe(200);
    expect(generateMeetingReview).toHaveBeenCalledWith("rec-1");
    expect(prismaMock.meetingRecording.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: { aiReview: { summary: "s", actionItems: [] }, status: "complete" },
    });
    // Digest is a no-op if already sent; the caller always invokes it.
    expect(sendMeetingDigestSafe).toHaveBeenCalledWith("rec-1");
  });

  it("marks failed (transcript retained) when summarisation throws", async () => {
    generateMeetingReview.mockRejectedValue(new Error("model down"));
    const res = await regenerate(
      createRequest("POST", "/api/meetings/m-1/recordings/rec-1/regenerate"),
      regenCtx,
    );
    expect(res.status).toBe(502);
    expect(prismaMock.meetingRecording.update).toHaveBeenCalledWith({
      where: { id: "rec-1" },
      data: { status: "failed", error: "model down" },
    });
  });
});
