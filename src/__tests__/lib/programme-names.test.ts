/**
 * Family-facing programme names.
 *
 * These exist because no parent has ever been told what "BSC" means. The
 * tests below are mostly about the mapping being in ONE place — the
 * strings were previously typed inline wherever a session needed a
 * label, which is how the booking dialog said "ASC" while the roll call
 * said "After School Care".
 */
import { describe, it, expect } from "vitest";
import {
  PROGRAMME_NAMES,
  programmeName,
  isSessionCode,
} from "@/lib/programme-names";

describe("programmeName", () => {
  it("maps every session code to its Amana programme name", () => {
    expect(programmeName("bsc")).toBe("Rise and Shine Club");
    expect(programmeName("asc")).toBe("Amana Afternoons");
    expect(programmeName("vc")).toBe("Holiday Quest");
  });

  it("is case-insensitive — stored codes aren't reliably lowercase", () => {
    expect(programmeName("BSC")).toBe("Rise and Shine Club");
    expect(programmeName("Asc")).toBe("Amana Afternoons");
  });

  it("never renders a bare code to a parent", () => {
    for (const code of Object.keys(PROGRAMME_NAMES)) {
      expect(programmeName(code)).not.toMatch(/^(bsc|asc|vc)$/i);
    }
  });

  it("returns empty for nothing, so a row renders blank not 'undefined'", () => {
    expect(programmeName(null)).toBe("");
    expect(programmeName(undefined)).toBe("");
    expect(programmeName("")).toBe("");
  });

  it("surfaces an unknown code rather than swallowing it", () => {
    // A stray code should look wrong on screen so someone notices, not
    // vanish from the booking row leaving a child's name alone.
    expect(programmeName("osh")).toBe("OSH");
  });
});

describe("isSessionCode", () => {
  it("accepts the three codes in any case", () => {
    expect(isSessionCode("bsc")).toBe(true);
    expect(isSessionCode("VC")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isSessionCode("osh")).toBe(false);
    expect(isSessionCode(null)).toBe(false);
    expect(isSessionCode(42)).toBe(false);
  });
});
