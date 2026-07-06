import { describe, it, expect } from "vitest";
import { centreColor, CENTRE_PALETTE_SIZE } from "@/lib/centre-colors";

describe("centreColor", () => {
  it("is deterministic — same code, same colour, every call", () => {
    expect(centreColor("GRN")).toEqual(centreColor("GRN"));
    expect(centreColor("grn").hex).toBe(centreColor("GRN").hex); // case-insensitive
    expect(centreColor(" GRN ").hex).toBe(centreColor("GRN").hex); // trim
  });

  it("returns a well-formed colour for every input including empty", () => {
    for (const code of ["GRN", "PBL", "HRV", "", "Unity Grammar", "svc-123"]) {
      const c = centreColor(code);
      expect(c.hex).toMatch(/^#[0-9A-F]{6}$/i);
      expect(c.chip).toContain("bg-");
      expect(c.chip).toContain("text-");
    }
  });

  it("spreads distinct codes across the palette", () => {
    const codes = ["GRN", "PBL", "HRV", "BNK", "AUB", "LAK", "CHT", "MRL", "RWD", "WLY", "UGR"];
    const hues = new Set(codes.map((c) => centreColor(c).hex));
    // 11 codes over an 11-colour palette won't be perfect, but a
    // degenerate hash would collapse to 1-2 buckets.
    expect(hues.size).toBeGreaterThanOrEqual(Math.min(6, CENTRE_PALETTE_SIZE));
  });
});
