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

import { RecordingIndicator, formatElapsed } from "@/components/meetings/RecordingIndicator";

describe("RecordingIndicator", () => {
  beforeEach(() => {
    ctx.status = "idle";
    ctx.elapsedSeconds = 0;
    ctx.stop.mockReset();
    usePathname.mockReturnValue("/todos");
  });

  it("shows no pill while idle but keeps an empty live region mounted", () => {
    render(<RecordingIndicator />);
    expect(screen.queryByText(/REC/)).not.toBeInTheDocument();
    expect(screen.queryByText(/uploading recording/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stop recording/i })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("shows elapsed time, Stop, and a back link away from the meetings page", () => {
    ctx.status = "recording";
    ctx.elapsedSeconds = 754;
    render(<RecordingIndicator />);
    expect(screen.getByText("REC 12:34")).toBeInTheDocument();
    // The ticking timer is hidden from AT; only the state is announced.
    expect(screen.getByRole("status")).toHaveTextContent("Recording in progress");
    expect(screen.getByText("REC 12:34")).toHaveAttribute("aria-hidden", "true");
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

  it("formatElapsed pads and rolls minutes past 59", () => {
    expect(formatElapsed(5)).toBe("00:05");
    expect(formatElapsed(3661)).toBe("61:01");
  });

  it("shows an uploading state without a Stop button", () => {
    ctx.status = "uploading";
    render(<RecordingIndicator />);
    expect(screen.getByText("Uploading recording…")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Uploading recording");
    expect(screen.queryByRole("button", { name: /stop recording/i })).not.toBeInTheDocument();
  });
});
