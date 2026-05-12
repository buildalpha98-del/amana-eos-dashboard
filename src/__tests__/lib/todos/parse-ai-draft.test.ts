import { describe, it, expect } from "vitest";
import { parseAiDraft } from "@/lib/todos/parse-ai-draft";

describe("parseAiDraft", () => {
  it("parses a clean JSON response with title + description", () => {
    const raw = JSON.stringify({
      title: "Confirm Bonnyrigg roof inspection time",
      description: "Reach out to the property manager by Friday to lock a window.",
    });
    expect(parseAiDraft(raw)).toEqual({
      title: "Confirm Bonnyrigg roof inspection time",
      description: "Reach out to the property manager by Friday to lock a window.",
    });
  });

  it("strips ```json fences the model sometimes adds", () => {
    const raw = '```json\n{"title":"x","description":"y"}\n```';
    expect(parseAiDraft(raw)).toEqual({ title: "x", description: "y" });
  });

  it("strips plain ``` fences", () => {
    const raw = '```\n{"title":"x","description":"y"}\n```';
    expect(parseAiDraft(raw)).toEqual({ title: "x", description: "y" });
  });

  it("returns null when title is missing", () => {
    expect(parseAiDraft('{"description":"y"}')).toBeNull();
  });

  it("returns null when description is missing", () => {
    expect(parseAiDraft('{"title":"x"}')).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(parseAiDraft("not json")).toBeNull();
  });

  it("returns null when fields are non-string types", () => {
    expect(parseAiDraft('{"title":42,"description":"y"}')).toBeNull();
    expect(parseAiDraft('{"title":"x","description":null}')).toBeNull();
  });

  it("preserves whitespace and newlines inside description", () => {
    const raw = JSON.stringify({
      title: "x",
      description: "Line one.\n\nLine two.",
    });
    const result = parseAiDraft(raw);
    expect(result?.description).toBe("Line one.\n\nLine two.");
  });
});
