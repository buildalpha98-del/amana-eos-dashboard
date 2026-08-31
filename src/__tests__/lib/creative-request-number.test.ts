import { describe, it, expect, vi } from "vitest";
import {
  formatRequestNumber,
  generateRequestNumber,
  createWithNumberRetry,
} from "@/lib/creative-request/request-number";

describe("formatRequestNumber", () => {
  it("zero-pads to 4 digits", () => {
    expect(formatRequestNumber(2026, 7)).toBe("REQ-2026-0007");
    expect(formatRequestNumber(2026, 1234)).toBe("REQ-2026-1234");
  });
});

describe("generateRequestNumber", () => {
  it("counts existing requests for the year and adds 1", async () => {
    const tx = {
      creativeRequest: { count: vi.fn().mockResolvedValue(41) },
    };
    const n = await generateRequestNumber(tx as never, 2026);
    expect(n).toBe("REQ-2026-0042");
    expect(tx.creativeRequest.count).toHaveBeenCalledWith({
      where: { requestNumber: { startsWith: "REQ-2026-" } },
    });
  });
});

describe("createWithNumberRetry", () => {
  it("retries on P2002 unique conflict then succeeds", async () => {
    let calls = 0;
    const attempt = vi.fn(async (num: string) => {
      calls++;
      if (calls === 1) throw Object.assign(new Error("dup"), { code: "P2002" });
      return { requestNumber: num };
    });
    const generate = vi
      .fn()
      .mockResolvedValueOnce("REQ-2026-0001")
      .mockResolvedValueOnce("REQ-2026-0002");
    const result = await createWithNumberRetry(attempt, generate);
    expect(result).toEqual({ requestNumber: "REQ-2026-0002" });
  });

  it("rethrows non-P2002 errors immediately", async () => {
    const attempt = vi.fn(async () => {
      throw new Error("boom");
    });
    const generate = vi.fn().mockResolvedValue("REQ-2026-0001");
    await expect(createWithNumberRetry(attempt, generate)).rejects.toThrow("boom");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("rethrows the last P2002 error when every attempt is exhausted", async () => {
    const attempt = vi.fn(async () => {
      throw Object.assign(new Error("dup"), { code: "P2002" });
    });
    const generate = vi.fn().mockResolvedValue("REQ-2026-0001");
    await expect(createWithNumberRetry(attempt, generate)).rejects.toThrow("dup");
    expect(attempt).toHaveBeenCalledTimes(3);
  });
});
