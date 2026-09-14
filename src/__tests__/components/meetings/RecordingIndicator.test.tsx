// src/__tests__/components/meetings/RecordingIndicator.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const usePathname = vi.fn(() => "/todos");
vi.mock("next/navigation", () => ({ usePathname: () => usePathname() }));

const ctx = {
  status: "idle" as "idle" | "recording" | "uploading",
  meetingId: null as string | null,
  elapsedSeconds: 0,
  error: null,
  start: vi.fn(),
  stop: vi.fn(),
  recoverable: [],
  uploadRecoverable: vi.fn(),
  discardRecoverable: vi.fn(),
};
vi.mock("@/components/meetings/MeetingRecorderProvider", () => ({ useMeetingRecorder: () => ctx }));

import { RecordingIndicator } from "@/components/meetings/RecordingIndicator";

describe("RecordingIndicator", () => {
  beforeEach(() => {
    ctx.status = "idle";
    ctx.elapsedSeconds = 0;
    ctx.stop.mockReset();
    usePathname.mockReturnValue("/todos");
  });

  it("renders nothing while idle", () => {
    const { container } = render(<RecordingIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows elapsed time, Stop, and a back link away from the meetings page", () => {
    ctx.status = "recording";
    ctx.elapsedSeconds = 754;
    render(<RecordingIndicator />);
    expect(screen.getByText("REC 12:34")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
    expect(ctx.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /back to meeting/i })).toHaveAttribute("href", "/meetings");
  });

  it("hides the back link on the meetings page", () => {
    ctx.status = "recording";
    usePathname.mockReturnValue("/meetings");
    render(<RecordingIndicator />);
    expect(screen.queryByRole("link", { name: /back to meeting/i })).not.toBeInTheDocument();
  });

  it("shows an uploading state without a Stop button", () => {
    ctx.status = "uploading";
    render(<RecordingIndicator />);
    expect(screen.getByText(/uploading recording/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stop recording/i })).not.toBeInTheDocument();
  });
});
