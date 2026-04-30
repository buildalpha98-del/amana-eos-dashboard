// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
}));

import { useSearchParams } from "next/navigation";
import { useV2Flag } from "@/app/parent/utils/useV2Flag";

describe("useV2Flag", () => {
  const OLD_ENV = process.env.NEXT_PUBLIC_PARENT_PORTAL_V2;

  beforeEach(() => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);
  });

  afterEach(() => {
    if (OLD_ENV === undefined) {
      delete process.env.NEXT_PUBLIC_PARENT_PORTAL_V2;
    } else {
      process.env.NEXT_PUBLIC_PARENT_PORTAL_V2 = OLD_ENV;
    }
  });

  it("returns true when ?v2=1", () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("v2=1") as never);
    const { result } = renderHook(() => useV2Flag());
    expect(result.current).toBe(true);
  });

  it("returns false when ?v2=0, ignoring env", () => {
    process.env.NEXT_PUBLIC_PARENT_PORTAL_V2 = "true";
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("v2=0") as never);
    const { result } = renderHook(() => useV2Flag());
    expect(result.current).toBe(false);
  });

  it("falls back to env var when no query override", () => {
    process.env.NEXT_PUBLIC_PARENT_PORTAL_V2 = "true";
    const { result } = renderHook(() => useV2Flag());
    expect(result.current).toBe(true);
  });

  it("returns false when env var is not 'true'", () => {
    process.env.NEXT_PUBLIC_PARENT_PORTAL_V2 = "false";
    const { result } = renderHook(() => useV2Flag());
    expect(result.current).toBe(false);
  });
});
