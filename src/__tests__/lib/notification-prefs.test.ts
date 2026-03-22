import { describe, it, expect } from "vitest";
import {
  parseJsonField,
  notificationPrefsSchema,
} from "@/lib/schemas/json-fields";

describe("Notification preferences validation", () => {
  it("parses valid notification prefs", () => {
    const raw = {
      overdueTodos: true,
      newAssignments: false,
      complianceAlerts: true,
      weeklyDigest: true,
      dailyDigest: false,
    };
    const result = parseJsonField(raw, notificationPrefsSchema, {});
    expect(result).toEqual(raw);
  });

  it("returns fallback for null input", () => {
    const fallback = { overdueTodos: true };
    expect(parseJsonField(null, notificationPrefsSchema, fallback)).toEqual(fallback);
  });

  it("returns fallback for undefined input", () => {
    const fallback = { overdueTodos: false };
    expect(parseJsonField(undefined, notificationPrefsSchema, fallback)).toEqual(fallback);
  });

  it("returns fallback for invalid input (string)", () => {
    const fallback = {};
    expect(parseJsonField("invalid", notificationPrefsSchema, fallback)).toEqual(fallback);
  });

  it("passes through extra fields due to passthrough()", () => {
    const raw = {
      overdueTodos: true,
      customPref: "yes",
    };
    const result = parseJsonField(raw, notificationPrefsSchema, {});
    expect((result as Record<string, unknown>).customPref).toBe("yes");
  });

  it("fills defaults for missing boolean fields", () => {
    const raw = { overdueTodos: true };
    const result = parseJsonField(raw, notificationPrefsSchema, {});
    expect(result.overdueTodos).toBe(true);
    // Other fields are optional so they remain undefined
    expect(result.newAssignments).toBeUndefined();
  });

  it("rejects non-boolean values for boolean fields", () => {
    const raw = { overdueTodos: "yes" };
    const fallback = { overdueTodos: true };
    const result = parseJsonField(raw, notificationPrefsSchema, fallback);
    // Schema has boolean validation, so "yes" fails and returns fallback
    expect(result).toEqual(fallback);
  });
});
