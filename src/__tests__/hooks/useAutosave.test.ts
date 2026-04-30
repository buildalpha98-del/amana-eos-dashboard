// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAutosave } from "@/hooks/useAutosave";

describe("useAutosave", () => {
  it("starts idle when value matches", () => {
    const onSave = vi.fn();
    const { result } = renderHook(({ v }) => useAutosave(v, onSave), { initialProps: { v: { a: 1 } } });
    expect(result.current.status).toBe("idle");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("transitions to dirty when value changes, then saves after debounce", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, onSave, { delayMs: 50 }), {
      initialProps: { v: { a: 1 } as Record<string, unknown> },
    });
    expect(result.current.status).toBe("idle");

    rerender({ v: { a: 2 } });
    expect(result.current.status).toBe("dirty");

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(onSave).toHaveBeenCalledWith({ a: 2 });
    await waitFor(() => expect(result.current.status).toBe("saved"));
    expect(result.current.lastSavedAt).not.toBeNull();
  });

  it("debounces multiple rapid edits into a single save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, onSave, { delayMs: 50 }), {
      initialProps: { v: { a: 1 } as Record<string, unknown> },
    });
    rerender({ v: { a: 2 } });
    rerender({ v: { a: 3 } });
    rerender({ v: { a: 4 } });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(onSave).toHaveBeenCalledWith({ a: 4 });
    await waitFor(() => expect(result.current.status).toBe("saved"));
  });

  it("flush triggers an immediate save", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, onSave, { delayMs: 5000 }), {
      initialProps: { v: { a: 1 } as Record<string, unknown> },
    });
    rerender({ v: { a: 2 } });
    expect(result.current.status).toBe("dirty");
    await act(async () => {
      await result.current.flush();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("transitions to error when onSave throws", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("boom"));
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, onSave, { delayMs: 50 }), {
      initialProps: { v: { a: 1 } as Record<string, unknown> },
    });
    rerender({ v: { a: 2 } });
    await waitFor(() => expect(result.current.status).toBe("error"), { timeout: 1000 });
    expect(result.current.errorMessage).toBe("boom");
  });

  it("reset clears dirty without saving", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, onSave, { delayMs: 5000 }), {
      initialProps: { v: { a: 1 } as Record<string, unknown> },
    });
    rerender({ v: { a: 2 } });
    expect(result.current.status).toBe("dirty");
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe("idle");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not save when value matches the last-saved value", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ v }) => useAutosave(v, onSave, { delayMs: 50 }), {
      initialProps: { v: { a: 1 } as Record<string, unknown> },
    });
    rerender({ v: { a: 2 } });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1), { timeout: 1000 });
    await waitFor(() => expect(result.current.status).toBe("saved"));

    rerender({ v: { a: 2 } });
    await new Promise((r) => setTimeout(r, 200));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("saved");
  });
});
