/**
 * LMS media sanitizer — host allow-list for <img>/<iframe>.
 */
import { describe, it, expect } from "vitest";
import {
  isAllowedMediaSrc,
  rehypeLmsMediaHostFilter,
} from "@/lib/lms-sanitize-schema";

const BLOB = "https://abc123.public.blob.vercel-storage.com/lms/photo.png";

describe("isAllowedMediaSrc", () => {
  it("allows Blob-hosted images", () => {
    expect(isAllowedMediaSrc("img", BLOB)).toBe(true);
  });
  it("rejects non-Blob images", () => {
    expect(isAllowedMediaSrc("img", "https://evil.com/x.png")).toBe(false);
    expect(isAllowedMediaSrc("img", "http://tracker.example/pixel.gif")).toBe(false);
  });
  it("allows whitelisted video iframes", () => {
    expect(isAllowedMediaSrc("iframe", "https://www.youtube.com/embed/abc")).toBe(true);
    expect(isAllowedMediaSrc("iframe", "https://www.loom.com/embed/xyz")).toBe(true);
    expect(isAllowedMediaSrc("iframe", "https://player.vimeo.com/video/123")).toBe(true);
  });
  it("rejects non-whitelisted iframe hosts", () => {
    expect(isAllowedMediaSrc("iframe", "https://evil.com/embed")).toBe(false);
  });
  it("rejects non-https and javascript: iframe src", () => {
    expect(isAllowedMediaSrc("iframe", "http://www.youtube.com/embed/x")).toBe(false);
    expect(isAllowedMediaSrc("iframe", "javascript:alert(1)")).toBe(false);
  });
  it("rejects empty/undefined src", () => {
    expect(isAllowedMediaSrc("img", undefined)).toBe(false);
    expect(isAllowedMediaSrc("iframe", "")).toBe(false);
  });
});

describe("rehypeLmsMediaHostFilter", () => {
  function el(tagName: string, src: string) {
    return { type: "element", tagName, properties: { src }, children: [] };
  }

  it("strips disallowed media but keeps allowed media and other nodes", () => {
    const tree = {
      type: "root",
      children: [
        el("iframe", "https://www.youtube.com/embed/ok"), // keep
        el("iframe", "https://evil.com/embed"), // strip
        el("img", BLOB), // keep
        el("img", "https://evil.com/x.png"), // strip
        { type: "element", tagName: "p", properties: {}, children: [] }, // keep
      ],
    };
    rehypeLmsMediaHostFilter()(tree as never);
    const kinds = tree.children.map(
      (c: { tagName?: string; properties?: { src?: string } }) => `${c.tagName}:${c.properties?.src ?? ""}`,
    );
    expect(kinds).toEqual([
      "iframe:https://www.youtube.com/embed/ok",
      "img:" + BLOB,
      "p:",
    ]);
  });

  it("recurses into nested children", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "div",
          properties: {},
          children: [el("iframe", "https://evil.com/embed")],
        },
      ],
    };
    rehypeLmsMediaHostFilter()(tree as never);
    expect((tree.children[0] as { children: unknown[] }).children).toHaveLength(0);
  });
});
