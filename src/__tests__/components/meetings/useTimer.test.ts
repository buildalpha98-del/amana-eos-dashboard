// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTimer } from "@/components/meetings/useTimer";

describe("useTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at the full duration and runs by default", () => {
    const { result } = renderHook(() => useTimer(5));
    expect(result.current.totalSeconds).toBe(5 * 60);
    expect(result.current.minutes).toBe(5);
    expect(result.current.seconds).toBe(0);
    expect(result.current.isRunning).toBe(true);
    expect(result.current.isOvertime).toBe(false);
  });

  it("decrements every second while running", () => {
    const { result } = renderHook(() => useTimer(1));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.totalSeconds).toBe(57);
    expect(result.current.seconds).toBe(57);
    expect(result.current.minutes).toBe(0);
  });

  it("pauses when toggle is called (no longer decrements)", () => {
    const { result } = renderHook(() => useTimer(1));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const beforePause = result.current.totalSeconds;

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isRunning).toBe(false);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.totalSeconds).toBe(beforePause);
  });

  it("resumes ticking when toggled back to running", () => {
    const { result } = renderHook(() => useTimer(1));
    act(() => {
      result.current.toggle(); // pause
    });
    const paused = result.current.totalSeconds;
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.totalSeconds).toBe(paused);

    act(() => {
      result.current.toggle(); // resume
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.totalSeconds).toBe(paused - 2);
  });

  it("reset(n) returns the counter to n minutes and sets running", () => {
    const { result } = renderHook(() => useTimer(1));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.totalSeconds).toBe(50);

    act(() => {
      result.current.reset(3);
    });
    expect(result.current.totalSeconds).toBe(3 * 60);
    expect(result.current.isRunning).toBe(true);
  });

  it("flags overtime when the counter reaches 0 while running", () => {
    const { result } = renderHook(() => useTimer(0));
    // With duration 0, totalSeconds starts at 0 and isRunning=true → overtime
    expect(result.current.totalSeconds).toBe(0);
    expect(result.current.isOvertime).toBe(true);
  });
});
