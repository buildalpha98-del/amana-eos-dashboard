import { describe, it, expect } from "vitest";
import {
  canAdvanceModule,
  requiredSecondsOnPage,
  firstIncompleteIndex,
  toVideoEmbedUrl,
} from "@/lib/course-player";

describe("toVideoEmbedUrl", () => {
  it("converts YouTube watch URLs to nocookie embeds", () => {
    expect(toVideoEmbedUrl("https://www.youtube.com/watch?v=abc123")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123",
    );
    expect(toVideoEmbedUrl("https://youtu.be/abc123")).toBe(
      "https://www.youtube-nocookie.com/embed/abc123",
    );
  });
  it("converts Vimeo and Loom share URLs", () => {
    expect(toVideoEmbedUrl("https://vimeo.com/123456")).toBe(
      "https://player.vimeo.com/video/123456",
    );
    expect(toVideoEmbedUrl("https://www.loom.com/share/xyz789")).toBe(
      "https://www.loom.com/embed/xyz789",
    );
  });
  it("returns null for unknown providers or junk", () => {
    expect(toVideoEmbedUrl("https://evil.com/video")).toBeNull();
    expect(toVideoEmbedUrl("not a url")).toBeNull();
    expect(toVideoEmbedUrl(null)).toBeNull();
  });
});

describe("requiredSecondsOnPage", () => {
  it("is a 60s anti-skip floor", () => {
    expect(requiredSecondsOnPage({ duration: null })).toBe(60);
    expect(requiredSecondsOnPage({ duration: 10 })).toBe(60);
  });
});

describe("canAdvanceModule", () => {
  const base = { timeOnPageSec: 0, quizPassed: false, alreadyComplete: false };

  it("document: locked until dwell floor met", () => {
    const m = { type: "document" as const, duration: null };
    expect(canAdvanceModule(m, { ...base, timeOnPageSec: 30 })).toBe(false);
    expect(canAdvanceModule(m, { ...base, timeOnPageSec: 60 })).toBe(true);
  });

  it("video: same dwell rule", () => {
    const m = { type: "video" as const, duration: 5 };
    expect(canAdvanceModule(m, { ...base, timeOnPageSec: 59 })).toBe(false);
    expect(canAdvanceModule(m, { ...base, timeOnPageSec: 61 })).toBe(true);
  });

  it("quiz: locked until passed", () => {
    const m = { type: "quiz" as const, duration: null };
    expect(canAdvanceModule(m, { ...base, timeOnPageSec: 999 })).toBe(false);
    expect(canAdvanceModule(m, { ...base, quizPassed: true })).toBe(true);
  });

  it("already-complete module always advances", () => {
    const m = { type: "quiz" as const, duration: null };
    expect(canAdvanceModule(m, { ...base, alreadyComplete: true })).toBe(true);
  });
});

describe("firstIncompleteIndex", () => {
  const mods = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("returns the first incomplete", () => {
    expect(firstIncompleteIndex(mods, new Set(["a"]))).toBe(1);
  });
  it("returns 0 when all complete", () => {
    expect(firstIncompleteIndex(mods, new Set(["a", "b", "c"]))).toBe(0);
  });
  it("returns 0 when none complete", () => {
    expect(firstIncompleteIndex(mods, new Set())).toBe(0);
  });
});
