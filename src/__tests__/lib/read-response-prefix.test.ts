import { describe, expect, it, vi } from "vitest";
import { readResponsePrefix } from "@/lib/read-response-prefix";

describe("bounded response reads", () => {
  it("returns a short complete body", async () => {
    expect((await readResponsePrefix(new Response("hello"), 4096)).toString()).toBe("hello");
  });
  it("returns only the permitted bytes and cancels a continuing stream", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode("123456789")); }, cancel,
    }));
    expect((await readResponsePrefix(response, 4)).toString()).toBe("1234");
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.body?.locked).toBe(false);
  });
  it("enforces the cap across multiple chunks", async () => {
    const response = new Response(new ReadableStream({
      start(controller) {
        for (const value of ["ab", "cd", "ef"]) controller.enqueue(new TextEncoder().encode(value));
        controller.close();
      },
    }));
    expect((await readResponsePrefix(response, 5)).toString()).toBe("abcde");
  });
  it("handles an empty body", async () => {
    expect(await readResponsePrefix(new Response(null), 4)).toEqual(Buffer.alloc(0));
  });
  it("propagates a body failure and releases the reader", async () => {
    const response = new Response(new ReadableStream({ start(controller) { controller.error(new Error("body interrupted")); } }));
    await expect(readResponsePrefix(response, 4)).rejects.toThrow("body interrupted");
    expect(response.body?.locked).toBe(false);
  });
});
