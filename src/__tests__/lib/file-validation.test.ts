import { describe, it, expect } from "vitest";
import { detectFileType, validateFileContent } from "@/lib/file-validation";

function createBuffer(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

describe("detectFileType", () => {
  it("detects PDF files", () => {
    // %PDF magic bytes
    const buffer = createBuffer([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    expect(detectFileType(buffer)).toBe("application/pdf");
  });

  it("detects PNG files", () => {
    // 89 50 4E 47 magic bytes
    const buffer = createBuffer([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectFileType(buffer)).toBe("image/png");
  });

  it("detects JPEG files", () => {
    // FF D8 FF magic bytes
    const buffer = createBuffer([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectFileType(buffer)).toBe("image/jpeg");
  });

  it("detects GIF files (GIF89a)", () => {
    // GIF89a
    const buffer = createBuffer([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectFileType(buffer)).toBe("image/gif");
  });

  it("detects GIF files (GIF87a)", () => {
    // GIF87a
    const buffer = createBuffer([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
    expect(detectFileType(buffer)).toBe("image/gif");
  });

  it("detects WebP files", () => {
    // RIFF....WEBP
    const buffer = createBuffer([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size placeholder
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(detectFileType(buffer)).toBe("image/webp");
  });

  it("detects little-endian TIFF files (II*\\0)", () => {
    const buffer = createBuffer([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
    expect(detectFileType(buffer)).toBe("image/tiff");
  });

  it("detects big-endian TIFF files (MM\\0*)", () => {
    const buffer = createBuffer([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]);
    expect(detectFileType(buffer)).toBe("image/tiff");
  });

  it("detects BMP files (BM header)", () => {
    // A full 14-byte BITMAPFILEHEADER: "BM", 4-byte size, two 2-byte reserved
    // fields (spec says both are zero), then the 4-byte pixel-data offset.
    // The old fixture stopped at 8 bytes, so it never covered the reserved
    // fields the detector now checks to tell a bitmap from text starting "BM".
    const buffer = createBuffer([
      0x42, 0x4d, 0x36, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x36, 0x00,
      0x00, 0x00,
    ]);
    expect(detectFileType(buffer)).toBe("image/bmp");
  });

  it("does not mistake text beginning \"BM\" for a bitmap", () => {
    const csv = new TextEncoder().encode("BMI,Weight\n22.4,70\n");
    expect(detectFileType(csv.buffer)).toBe("text/plain");
  });

  it("detects ZIP-based Office formats (PK header)", () => {
    // PK\x03\x04 header
    const buffer = createBuffer([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(detectFileType(buffer)).toBe("application/zip");
  });

  it("detects SVG files", () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const encoder = new TextEncoder();
    const buffer = encoder.encode(svgContent).buffer;
    expect(detectFileType(buffer)).toBe("image/svg+xml");
  });

  it("detects XML-based SVG files", () => {
    const svgContent = '<?xml version="1.0"?><svg><circle/></svg>';
    const encoder = new TextEncoder();
    const buffer = encoder.encode(svgContent).buffer;
    expect(detectFileType(buffer)).toBe("image/svg+xml");
  });

  it("returns null for unknown file types", () => {
    const buffer = createBuffer([0x00, 0x00, 0x00, 0x00]);
    expect(detectFileType(buffer)).toBeNull();
  });

  it("returns null for empty buffer", () => {
    const buffer = createBuffer([]);
    expect(detectFileType(buffer)).toBeNull();
  });
});

describe("validateFileContent", () => {
  it("returns true for matching PDF", () => {
    const buffer = createBuffer([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(validateFileContent(buffer, "application/pdf")).toBe(true);
  });

  it("returns true for matching PNG", () => {
    const buffer = createBuffer([0x89, 0x50, 0x4e, 0x47, 0x0d]);
    expect(validateFileContent(buffer, "image/png")).toBe(true);
  });

  it("returns true for matching JPEG", () => {
    const buffer = createBuffer([0xff, 0xd8, 0xff, 0xe0]);
    expect(validateFileContent(buffer, "image/jpeg")).toBe(true);
  });

  it("returns false for mismatched MIME type (PDF content, JPEG declared)", () => {
    const buffer = createBuffer([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(validateFileContent(buffer, "image/jpeg")).toBe(false);
  });

  it("returns false for mismatched MIME type (JPEG content, PNG declared)", () => {
    const buffer = createBuffer([0xff, 0xd8, 0xff, 0xe0]);
    expect(validateFileContent(buffer, "image/png")).toBe(false);
  });

  it("returns true for ZIP-based DOCX", () => {
    const buffer = createBuffer([0x50, 0x4b, 0x03, 0x04]);
    expect(
      validateFileContent(
        buffer,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
  });

  it("returns true for ZIP-based XLSX", () => {
    const buffer = createBuffer([0x50, 0x4b, 0x03, 0x04]);
    expect(
      validateFileContent(
        buffer,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe(true);
  });

  it("returns true for ZIP-based PPTX", () => {
    const buffer = createBuffer([0x50, 0x4b, 0x03, 0x04]);
    expect(
      validateFileContent(
        buffer,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ),
    ).toBe(true);
  });

  it("returns false for unknown file content", () => {
    const buffer = createBuffer([0x00, 0x00, 0x00, 0x00]);
    expect(validateFileContent(buffer, "application/pdf")).toBe(false);
  });

  it("returns false for ZIP content with non-Office MIME", () => {
    const buffer = createBuffer([0x50, 0x4b, 0x03, 0x04]);
    expect(validateFileContent(buffer, "image/png")).toBe(false);
  });
});

/**
 * HEIC/HEIF support (PR: team-bug-bash).
 *
 * HEIC files are wrapped in the ISO Base Media File Format. Layout:
 *   bytes 0-3: 4-byte big-endian size (variable, ignored here)
 *   bytes 4-7: "ftyp" (66 74 79 70)
 *   bytes 8-11: brand — "heic", "heix", "mif1", "msf1", "heim", "heis"
 *
 * iPhones default to HEIC; even though the avatar <input accept=...>
 * filters them out and iOS auto-converts to JPEG in many cases, some
 * Android phones and recent iOS configurations still upload raw HEIC.
 * Pre-fix the validator rejected these with "File content does not
 * match declared type", which the user paraphrased as "failed to
 * fetch data" in the training feedback.
 */
function heicBuffer(brand: string): ArrayBuffer {
  const bytes = [
    0x00, 0x00, 0x00, 0x20, // size (32 bytes — arbitrary, doesn't matter)
    0x66, 0x74, 0x79, 0x70, // "ftyp"
    ...brand.split("").map((c) => c.charCodeAt(0)),
    0x00, 0x00, 0x00, 0x00, // minor version
  ];
  return new Uint8Array(bytes).buffer;
}

describe("detectFileType — HEIC/HEIF", () => {
  it("detects heic brand", () => {
    expect(detectFileType(heicBuffer("heic"))).toBe("image/heic");
  });

  it("detects heix brand", () => {
    expect(detectFileType(heicBuffer("heix"))).toBe("image/heic");
  });

  it("detects mif1 brand (Apple multi-image)", () => {
    expect(detectFileType(heicBuffer("mif1"))).toBe("image/heic");
  });

  it("detects msf1 brand (multi-image sequence)", () => {
    expect(detectFileType(heicBuffer("msf1"))).toBe("image/heic");
  });

  it("detects heim brand", () => {
    expect(detectFileType(heicBuffer("heim"))).toBe("image/heic");
  });

  it("does not falsely match non-ftyp buffers", () => {
    // Bytes 4-7 are NOT 'ftyp'
    const buffer = new Uint8Array([
      0x00, 0x00, 0x00, 0x20,
      0x6d, 0x6f, 0x6f, 0x76, // "moov"
      0x68, 0x65, 0x69, 0x63,
    ]).buffer;
    expect(detectFileType(buffer)).toBeNull();
  });
});

describe("validateFileContent — HEIC/HEIF", () => {
  it("accepts heic content declared as image/heic", () => {
    expect(validateFileContent(heicBuffer("heic"), "image/heic")).toBe(true);
  });

  it("accepts heic content declared as image/heif (Apple uses both)", () => {
    expect(validateFileContent(heicBuffer("heic"), "image/heif")).toBe(true);
  });

  it("rejects heic content declared as image/jpeg", () => {
    expect(validateFileContent(heicBuffer("heic"), "image/jpeg")).toBe(false);
  });
});

/**
 * 2026-08-25: /api/upload's allow-list and detectFileType had drifted apart.
 * Five types were advertised as uploadable but had no magic-byte signature, so
 * detectFileType returned null and validateFileContent rejected them every
 * single time with "File content does not match declared type". A user could
 * pick a .doc or .csv the picker offered and never be able to upload it.
 *
 * The allow-list is now shared (UPLOAD_ALLOWED_MIMES); this test pins the two
 * halves together so the drift cannot come back silently.
 */
describe("allow-list / sniffer parity", () => {
  const ole2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const plainText = new TextEncoder().encode("Name,Role\nTracie,Coordinator\n");

  it.each([
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
  ])("accepts legacy Office container %s (OLE2 header)", (mime) => {
    expect(validateFileContent(ole2.buffer, mime)).toBe(true);
  });

  it.each(["text/plain", "text/csv"])("accepts plain text as %s", (mime) => {
    expect(validateFileContent(plainText.buffer, mime)).toBe(true);
  });

  it("still rejects a binary payload masquerading as text", () => {
    const binary = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00]);
    expect(validateFileContent(binary.buffer, "text/plain")).toBe(false);
  });

  it("still rejects a PNG that claims to be a PDF", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(validateFileContent(png.buffer, "application/pdf")).toBe(false);
  });
});

// ── Recording-lane signatures (Phase 2, 2026-08-31) ─────────────────────

import { detectFileType as detect2, validateFileContent as validate2 } from "@/lib/file-validation";

function bufFrom(bytes: number[], pad = 16): ArrayBuffer {
  const arr = new Uint8Array(Math.max(bytes.length, pad));
  arr.set(bytes);
  return arr.buffer;
}

describe("detectFileType — audio/video containers (2026-08-31)", () => {
  it("detects EBML/WebM (1A 45 DF A3)", () => {
    expect(detect2(bufFrom([0x1a, 0x45, 0xdf, 0xa3]))).toBe("video/webm");
  });

  it("detects MP4 ftyp brands as the mp4 container", () => {
    for (const brand of ["isom", "mp42", "M4A "]) {
      const bytes = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
        ...[...brand].map((c) => c.charCodeAt(0))];
      expect(detect2(bufFrom(bytes))).toBe("video/mp4");
    }
  });

  it("still detects HEIC brands as heic, not mp4", () => {
    const bytes = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
      ...[..."heic"].map((c) => c.charCodeAt(0))];
    expect(detect2(bufFrom(bytes))).toBe("image/heic");
  });

  it("detects MP3 via ID3 tag and frame sync", () => {
    expect(detect2(bufFrom([0x49, 0x44, 0x33, 0x04, 0x00]))).toBe("audio/mpeg");
    for (const second of [0xfb, 0xf3, 0xf2, 0xfa]) {
      expect(detect2(bufFrom([0xff, second, 0x90, 0x00]))).toBe("audio/mpeg");
    }
  });

  it("detects WAV (RIFF....WAVE) without breaking WebP (RIFF....WEBP)", () => {
    const wav = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
      0x57, 0x41, 0x56, 0x45];
    expect(detect2(bufFrom(wav))).toBe("audio/wav");
    const webp = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50];
    expect(detect2(bufFrom(webp))).toBe("image/webp");
  });
});

describe("validateFileContent — container↔declared mappings (2026-08-31)", () => {
  const webm = bufFrom([0x1a, 0x45, 0xdf, 0xa3]);
  const mp4 = bufFrom([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
    ...[..."isom"].map((c) => c.charCodeAt(0))]);

  it("webm container satisfies audio/webm and video/webm", () => {
    expect(validate2(webm, "audio/webm")).toBe(true);
    expect(validate2(webm, "video/webm")).toBe(true);
  });

  it("mp4 container satisfies audio/mp4, video/mp4 and x-m4a", () => {
    expect(validate2(mp4, "audio/mp4")).toBe(true);
    expect(validate2(mp4, "video/mp4")).toBe(true);
    expect(validate2(mp4, "audio/x-m4a")).toBe(true);
  });

  it("a webm container does NOT satisfy an mp4 declaration", () => {
    expect(validate2(webm, "audio/mp4")).toBe(false);
  });
});
