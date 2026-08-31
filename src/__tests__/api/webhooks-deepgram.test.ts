import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
const sendMeetingDigestSafe = vi.fn();
vi.mock("@/lib/meeting-digest", () => ({
  sendMeetingDigestSafe: (id: string) => sendMeetingDigestSafe(id),
  sendMeetingDigest: vi.fn(),
}));
import { prismaMock } from "../helpers/prisma-mock";
import { createRequest } from "../helpers/request";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  generateRequestId: () => "test-req-id",
}));

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

import { POST } from "@/app/api/webhooks/deepgram/route";

const ORIGINAL_ENV = { ...process.env };

const happyPayload = {
  metadata: { request_id: "req-9", duration: 5400.4 },
  results: {
    utterances: [
      { speaker: 0, start: 0, end: 2, transcript: "Welcome all." },
      { speaker: 1, start: 2, end: 4, transcript: "Thanks." },
    ],
  },
};

function hookRequest(body: unknown, secret = "hook-secret") {
  return createRequest("POST", `/api/webhooks/deepgram?secret=${secret}`, {
    body: body as Record<string, unknown>,
  });
}

describe("POST /api/webhooks/deepgram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEEPGRAM_WEBHOOK_SECRET = "hook-secret";
    prismaMock.meetingRecording.findFirst.mockResolvedValue({
      id: "rec-1",
      audioBlobUrl: "https://x.blob.vercel-storage.com/a.webm",
      durationSeconds: null,
    });
    prismaMock.meetingRecording.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.meetingRecording.update.mockResolvedValue({});
    deleteFile.mockResolvedValue(undefined);
    generateMeetingReview.mockResolvedValue({ summary: "s" });
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("401s on a bad secret", async () => {
    const res = await POST(hookRequest(happyPayload, "wrong"));
    expect(res.status).toBe(401);
  });

  it("acks an unknown request_id without writes", async () => {
    prismaMock.meetingRecording.findFirst.mockResolvedValue(null);
    const res = await POST(hookRequest(happyPayload));
    expect(res.status).toBe(200);
    expect(prismaMock.meetingRecording.updateMany).not.toHaveBeenCalled();
  });

  it("happy path: transcript folded into the guarded claim, blob deleted, review stored", async () => {
    const res = await POST(hookRequest(happyPayload));
    expect(res.status).toBe(200);

    const claim = prismaMock.meetingRecording.updateMany.mock.calls[0][0] as {
      where: unknown;
      data: Record<string, unknown>;
    };
    expect(claim.where).toEqual({ id: "rec-1", status: "transcribing" });
    expect(claim.data.status).toBe("transcribed");
    expect(claim.data.transcript).toEqual([
      { speaker: 0, start: 0, end: 2, text: "Welcome all." },
      { speaker: 1, start: 2, end: 4, text: "Thanks." },
    ]);
    expect(claim.data.transcriptText).toBe("Speaker 0: Welcome all.\nSpeaker 1: Thanks.");
    expect(claim.data.durationSeconds).toBe(5400);

    expect(deleteFile).toHaveBeenCalledWith("https://x.blob.vercel-storage.com/a.webm");
    expect(generateMeetingReview).toHaveBeenCalledWith("rec-1");
    const finalUpdate = prismaMock.meetingRecording.update.mock.calls.at(-1)![0] as {
      data: Record<string, unknown>;
    };
    expect(finalUpdate.data.status).toBe("complete");
    expect(finalUpdate.data.aiReview).toEqual({ summary: "s" });
    expect(sendMeetingDigestSafe).toHaveBeenCalledWith("rec-1");
  });

  it("duplicate delivery no-ops after the guarded claim", async () => {
    prismaMock.meetingRecording.updateMany.mockResolvedValue({ count: 0 });
    const res = await POST(hookRequest(happyPayload));
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    expect(deleteFile).not.toHaveBeenCalled();
    expect(generateMeetingReview).not.toHaveBeenCalled();
  });

  it("a no-speech callback fails the recording and deletes the blob", async () => {
    const res = await POST(
      hookRequest({ metadata: { request_id: "req-9" }, results: {} }),
    );
    expect(res.status).toBe(200);
    const failCall = prismaMock.meetingRecording.updateMany.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(failCall.data.status).toBe("failed");
    expect(deleteFile).toHaveBeenCalled();
    expect(generateMeetingReview).not.toHaveBeenCalled();
  });

  it("summarisation failure leaves status failed with the transcript retained", async () => {
    generateMeetingReview.mockRejectedValue(new Error("model down"));
    const res = await POST(hookRequest(happyPayload));
    expect(res.status).toBe(200);
    const finalUpdate = prismaMock.meetingRecording.update.mock.calls.at(-1)![0] as {
      data: Record<string, unknown>;
    };
    expect(finalUpdate.data.status).toBe("failed");
    expect(finalUpdate.data.error).toBe("model down");
    // transcript was written during the claim and is never cleared
    expect(finalUpdate.data.transcript).toBeUndefined();
    expect(sendMeetingDigestSafe).not.toHaveBeenCalled();
  });

  it("blob-delete failure does not stop summarisation", async () => {
    deleteFile.mockRejectedValue(new Error("blob gone"));
    const res = await POST(hookRequest(happyPayload));
    expect(res.status).toBe(200);
    expect(generateMeetingReview).toHaveBeenCalled();
  });

  it("500s when the secret env is missing", async () => {
    delete process.env.DEEPGRAM_WEBHOOK_SECRET;
    const res = await POST(hookRequest(happyPayload));
    expect(res.status).toBe(500);
  });
});
