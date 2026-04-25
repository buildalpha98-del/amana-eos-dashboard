import { describe, it, expect } from "vitest";
import { extractJson } from "@/lib/ai-provider/json";

describe("ai-provider/extractJson", () => {
  it("parses raw JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses JSON wrapped in markdown fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("extracts the first balanced object from prose", () => {
    expect(
      extractJson('Here is the answer: {"a":1,"b":[2,3]} — hope it helps.'),
    ).toEqual({ a: 1, b: [2, 3] });
  });

  it("handles nested objects", () => {
    const input = 'Some text {"outer":{"inner":{"x":"hello {world}"}}} trailing';
    expect(extractJson(input)).toEqual({
      outer: { inner: { x: "hello {world}" } },
    });
  });

  it("returns null for unparseable text", () => {
    expect(extractJson("just some text, no JSON here")).toBeNull();
    expect(extractJson("")).toBeNull();
  });

  it("handles braces inside strings without breaking balance", () => {
    expect(extractJson('{"name":"O\'Brien {test}"}')).toEqual({
      name: "O'Brien {test}",
    });
  });
});
