// src/__tests__/components/meetings/RecordingRecoveryBanner.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const ctx = {
  status: "idle" as "idle" | "recording" | "uploading",
  meetingId: null,
  elapsedSeconds: 0,
  error: null,
  start: vi.fn(),
  stop: vi.fn(),
  recoverable: [] as { sessionId: string; meetingId: string; startedAt: number; updatedAt: number; chunkCount: number }[],
  uploadRecoverable: vi.fn(),
  discardRecoverable: vi.fn(),
};
vi.mock("@/components/meetings/MeetingRecorderProvider", () => ({ useMeetingRecorder: () => ctx }));

import { RecordingRecoveryBanner } from "@/components/meetings/RecordingRecoveryBanner";

describe("RecordingRecoveryBanner", () => {
  beforeEach(() => {
    ctx.status = "idle";
    ctx.recoverable = [];
    ctx.uploadRecoverable.mockReset();
    ctx.discardRecoverable.mockReset();
  });

  it("renders nothing when this meeting has no orphaned recording", () => {
    ctx.recoverable = [{ sessionId: "s", meetingId: "other", startedAt: 0, updatedAt: 60_000, chunkCount: 2 }];
    const { container } = render(<RecordingRecoveryBanner meetingId="m1" canManage />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers Upload and Discard for this meeting's orphan", () => {
    ctx.recoverable = [{ sessionId: "s1", meetingId: "m1", startedAt: 0, updatedAt: 125_000, chunkCount: 4 }];
    render(<RecordingRecoveryBanner meetingId="m1" canManage />);
    expect(screen.getByText(/unfinished recording/i)).toBeInTheDocument();
    expect(screen.getByText(/2 min/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    expect(ctx.uploadRecoverable).toHaveBeenCalledWith("s1");
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(ctx.discardRecoverable).toHaveBeenCalledWith("s1");
  });

  it("disables Upload while a recording is live", () => {
    ctx.status = "recording";
    ctx.recoverable = [{ sessionId: "s1", meetingId: "m1", startedAt: 0, updatedAt: 5_000, chunkCount: 1 }];
    render(<RecordingRecoveryBanner meetingId="m1" canManage />);
    expect(screen.getByRole("button", { name: /upload/i })).toBeDisabled();
  });

  it("hides the actions for users who cannot manage recordings", () => {
    ctx.recoverable = [{ sessionId: "s1", meetingId: "m1", startedAt: 0, updatedAt: 5_000, chunkCount: 1 }];
    render(<RecordingRecoveryBanner meetingId="m1" canManage={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
