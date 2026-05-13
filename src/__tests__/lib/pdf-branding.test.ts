/**
 * Coverage for the shared PDF branding primitives. We don't try to
 * assert rendered bytes — we just verify the helpers issue the right
 * jsPDF calls in the right order using a recording mock.
 */
import { describe, it, expect, vi } from "vitest";
import { BRAND, drawLogo, createPdfBuilder } from "@/lib/pdf/branding";

/** Minimal recording mock of the jsPDF surface we touch. */
function buildDocMock() {
  return {
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    setFillColor: vi.fn(),
    text: vi.fn(),
    rect: vi.fn(),
    addPage: vi.fn(),
    splitTextToSize: vi.fn((s: string, _width: number) => s.split("\n")),
    getTextWidth: vi.fn((s: string) => s.length * 2),
    internal: {
      pageSize: {
        getWidth: () => 210, // A4 portrait width in mm
      },
    },
  };
}

describe("BRAND constants", () => {
  it("exposes Midnight Green / Jonquil / Lemon Chiffon as RGB + hex", () => {
    expect(BRAND.green.rgb).toEqual([0, 78, 100]);
    expect(BRAND.green.hex).toBe("#004E64");
    expect(BRAND.yellow.rgb).toEqual([254, 206, 0]);
    expect(BRAND.yellow.hex).toBe("#FECE00");
    expect(BRAND.cream.rgb).toEqual([255, 242, 191]);
  });
});

describe("drawLogo", () => {
  it("paints 'Amana' in Jonquil and ' OSHC.' in white at the given anchor", () => {
    const doc = buildDocMock();
    drawLogo(doc as never, { x: 18, y: 15, fontSize: 16 });

    expect(doc.setFont).toHaveBeenCalledWith("helvetica", "bold");
    expect(doc.setFontSize).toHaveBeenCalledWith(16);

    // "Amana" in Jonquil
    const amanaIdx = doc.text.mock.calls.findIndex(
      ([s]) => s === "Amana",
    );
    expect(amanaIdx).toBe(0);
    expect(doc.text.mock.calls[0]).toEqual(["Amana", 18, 15]);
    // setTextColor(254, 206, 0) was called just before "Amana"
    expect(doc.setTextColor).toHaveBeenNthCalledWith(1, 254, 206, 0);

    // " OSHC." in white at x + width("Amana")
    const oshcIdx = doc.text.mock.calls.findIndex(
      ([s]) => s === " OSHC.",
    );
    expect(oshcIdx).toBeGreaterThan(amanaIdx);
    expect(doc.setTextColor).toHaveBeenNthCalledWith(2, 255, 255, 255);
  });

  it("defaults the font size to 18 when omitted", () => {
    const doc = buildDocMock();
    drawLogo(doc as never, { x: 0, y: 0 });
    expect(doc.setFontSize).toHaveBeenCalledWith(18);
  });
});

describe("createPdfBuilder.heading", () => {
  it("renders a green-filled bar at the cursor and advances y by 12mm", () => {
    const doc = buildDocMock();
    const b = createPdfBuilder(doc as never, { margin: 18 });
    b.y = 50;
    b.heading("Family Details");

    // Fill colour = Midnight Green
    expect(doc.setFillColor).toHaveBeenCalledWith(0, 78, 100);
    // Rect spans contentWidth = pageWidth(210) - margin*2 = 174
    expect(doc.rect).toHaveBeenCalledWith(18, 50, 174, 8, "F");
    // Heading text rendered offset slightly right of margin
    expect(doc.text).toHaveBeenCalledWith("Family Details", 21, 55.5);
    expect(b.y).toBe(62);
  });
});

describe("createPdfBuilder.row", () => {
  it("skips rendering when the value is null/undefined/empty", () => {
    const doc = buildDocMock();
    const b = createPdfBuilder(doc as never, { margin: 18 });
    const yBefore = b.y;
    b.row("Phone", null);
    b.row("Phone", undefined);
    b.row("Phone", "");
    expect(doc.text).not.toHaveBeenCalled();
    expect(b.y).toBe(yBefore);
  });

  it("renders booleans as Yes/No", () => {
    const doc = buildDocMock();
    const b = createPdfBuilder(doc as never, { margin: 18 });
    b.row("Court Orders", true);
    b.row("Privacy Accepted", false);

    const valueCalls = doc.text.mock.calls.filter(
      ([, x]) => x === 18 + 55,
    );
    expect(valueCalls.map((c) => c[0])).toEqual([["Yes"], ["No"]]);
  });

  it("renders string values at the label-offset column", () => {
    const doc = buildDocMock();
    const b = createPdfBuilder(doc as never, { margin: 20 });
    b.row("Email", "parent@example.com");
    // Label at x=margin
    expect(doc.text).toHaveBeenCalledWith("Email", 20, expect.any(Number));
    // Value at x=margin+55
    expect(doc.text).toHaveBeenCalledWith(
      ["parent@example.com"],
      75,
      expect.any(Number),
    );
  });
});

describe("createPdfBuilder.checkPage", () => {
  it("calls addPage and resets y when the cursor would overflow", () => {
    const doc = buildDocMock();
    const b = createPdfBuilder(doc as never, { margin: 18 });
    b.y = 270;
    b.checkPage(20); // 270 + 20 > 275 → overflow
    expect(doc.addPage).toHaveBeenCalledTimes(1);
    expect(b.y).toBe(18); // reset to margin
  });

  it("does not break the page when there's enough room", () => {
    const doc = buildDocMock();
    const b = createPdfBuilder(doc as never, { margin: 18 });
    b.y = 100;
    b.checkPage(20);
    expect(doc.addPage).not.toHaveBeenCalled();
    expect(b.y).toBe(100);
  });
});
