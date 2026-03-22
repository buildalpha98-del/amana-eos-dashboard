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
