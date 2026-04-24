import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  attachmentUrlsField,
  optionalAttachmentUrlsField,
  safeAttachmentUrl,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from "@/lib/schemas/message-attachments";

const TRUSTED_EXACT = "https://public.blob.vercel-storage.com/img-1.jpg";
const TRUSTED_SUBDOMAIN =
  "https://abcd.public.blob.vercel-storage.com/message-attachments/img-2.jpg";
const UNTRUSTED = "https://evil.example.com/image.jpg";

describe("safeAttachmentUrl", () => {
  it("accepts a Vercel Blob URL on the exact allowed host", () => {
    expect(() => safeAttachmentUrl.parse(TRUSTED_EXACT)).not.toThrow();
  });

  it("accepts a Vercel Blob URL on a random subdomain of the allowed host", () => {
    expect(() => safeAttachmentUrl.parse(TRUSTED_SUBDOMAIN)).not.toThrow();
  });

  it("rejects arbitrary external URLs", () => {
    expect(() => safeAttachmentUrl.parse(UNTRUSTED)).toThrow();
  });

  it("rejects non-URL strings", () => {
    expect(() => safeAttachmentUrl.parse("not-a-url")).toThrow();
    expect(() => safeAttachmentUrl.parse("")).toThrow();
  });
});

describe("attachmentUrlsField", () => {
  it("defaults to an empty array", () => {
    const schema = z.object({ attachmentUrls: attachmentUrlsField });
    expect(schema.parse({})).toEqual({ attachmentUrls: [] });
  });

  it("accepts up to 6 trusted URLs", () => {
    const list = Array.from(
      { length: MAX_ATTACHMENTS_PER_MESSAGE },
      (_, i) =>
        `https://abcd.public.blob.vercel-storage.com/message-attachments/img-${i}.jpg`,
    );
    expect(() =>
      z.object({ attachmentUrls: attachmentUrlsField }).parse({
        attachmentUrls: list,
      }),
    ).not.toThrow();
  });

  it("rejects 7 URLs (over the cap)", () => {
    const list = Array.from(
      { length: MAX_ATTACHMENTS_PER_MESSAGE + 1 },
      (_, i) =>
        `https://abcd.public.blob.vercel-storage.com/message-attachments/img-${i}.jpg`,
    );
    expect(() =>
      z.object({ attachmentUrls: attachmentUrlsField }).parse({
        attachmentUrls: list,
      }),
    ).toThrow();
  });

  it("rejects a list where any entry is untrusted", () => {
    expect(() =>
      z.object({ attachmentUrls: attachmentUrlsField }).parse({
        attachmentUrls: [TRUSTED_SUBDOMAIN, UNTRUSTED],
      }),
    ).toThrow();
  });
});

describe("optionalAttachmentUrlsField", () => {
  it("accepts undefined", () => {
    const schema = z.object({ attachmentUrls: optionalAttachmentUrlsField });
    expect(() => schema.parse({})).not.toThrow();
    expect(schema.parse({}).attachmentUrls).toBeUndefined();
  });

  it("still enforces the trusted-host rule when present", () => {
    expect(() =>
      z
        .object({ attachmentUrls: optionalAttachmentUrlsField })
        .parse({ attachmentUrls: [UNTRUSTED] }),
    ).toThrow();
  });
});
