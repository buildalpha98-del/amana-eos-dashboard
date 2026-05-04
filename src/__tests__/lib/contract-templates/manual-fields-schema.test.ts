import { manualFieldsSchema } from "@/lib/contract-templates/manual-fields-schema";
import { describe, it, expect } from "vitest";

describe("manualFieldsSchema", () => {
  it("accepts a valid field array", () => {
    const out = manualFieldsSchema.safeParse([
      { key: "probationPeriod", label: "Probation period", type: "text", required: false, default: "6 months" },
    ]);
    expect(out.success).toBe(true);
  });
  it("rejects duplicate keys", () => {
    const out = manualFieldsSchema.safeParse([
      { key: "x", label: "X", type: "text", required: true },
      { key: "x", label: "X again", type: "date", required: false },
    ]);
    expect(out.success).toBe(false);
  });
  it("rejects keys that collide with the auto-tag catalog", () => {
    const out = manualFieldsSchema.safeParse([
      { key: "staff.firstName", label: "Bad", type: "text", required: false },
    ]);
    expect(out.success).toBe(false);
  });
  it("rejects bad type values", () => {
    const out = manualFieldsSchema.safeParse([{ key: "x", label: "X", type: "bogus", required: true }]);
    expect(out.success).toBe(false);
  });
  it("rejects keys that pass the regex but collide with catalog (today)", () => {
    const out = manualFieldsSchema.safeParse([
      { key: "today", label: "Today", type: "date", required: false },
    ]);
    expect(out.success).toBe(false);
  });
});
