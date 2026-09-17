import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  parseJsonField,
  notificationPrefsSchema,
  primaryParentSchema,
  reportChecklistSchema,
  emailBlockSchema,
  gettingStartedProgressSchema,
} from "@/lib/schemas/json-fields";

// ---------------------------------------------------------------------------
// parseJsonField helper
// ---------------------------------------------------------------------------

describe("parseJsonField", () => {
  it("returns parsed value when valid", () => {
    const result = parseJsonField(
      { overdueTodos: true },
      notificationPrefsSchema,
      {},
    );
    expect(result).toEqual({ overdueTodos: true });
  });

  it("returns fallback for null input", () => {
    const fallback = { overdueTodos: false };
    const result = parseJsonField(null, notificationPrefsSchema, fallback);
    expect(result).toBe(fallback);
  });

  it("returns fallback for undefined input", () => {
    const fallback = { overdueTodos: false };
    const result = parseJsonField(undefined, notificationPrefsSchema, fallback);
    expect(result).toBe(fallback);
  });

  it("returns the fallback when the schema genuinely rejects the value", () => {
    const fallback = { name: "none" };
    // A schema with no per-field recovery: the whole parse fails, so the
    // caller gets its fallback. (primaryParentSchema deliberately no longer
    // behaves this way — see its own describe block below.)
    const strict = z.object({ name: z.string() });
    const result = parseJsonField({ name: 123 }, strict, fallback);
    expect(result).toBe(fallback);
  });

  it("recovers a parent record field by field rather than falling back", () => {
    // The enrolment-PDF regression: a numeric firstName used to sink the
    // record and blank the whole Primary Parent section downstream.
    const result = parseJsonField(
      { firstName: 123, surname: "Doe", email: "d@e.com" },
      primaryParentSchema,
      { firstName: "", surname: "" },
    );
    expect(result.surname).toBe("Doe");
    expect(result.email).toBe("d@e.com");
  });

  it("works with nested objects", () => {
    const input = {
      firstName: "Jane",
      surname: "Doe",
      email: "jane@example.com",
    };
    const result = parseJsonField(input, primaryParentSchema, {
      firstName: "",
      surname: "",
    });
    expect(result).toEqual(input);
  });
});

// ---------------------------------------------------------------------------
// notificationPrefsSchema
// ---------------------------------------------------------------------------

describe("notificationPrefsSchema", () => {
  it("accepts valid prefs object", () => {
    const input = {
      overdueTodos: true,
      newAssignments: false,
      complianceAlerts: true,
      weeklyDigest: false,
      dailyDigest: true,
    };
    const result = notificationPrefsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it("passes through unknown fields", () => {
    const input = { overdueTodos: true, customField: "hello" };
    const result = notificationPrefsSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it("accepts empty object", () => {
    const result = notificationPrefsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial fields", () => {
    const result = notificationPrefsSchema.safeParse({ dailyDigest: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ dailyDigest: true });
    }
  });
});

// ---------------------------------------------------------------------------
// primaryParentSchema
// ---------------------------------------------------------------------------

describe("primaryParentSchema", () => {
  it("accepts valid parent with required fields", () => {
    const input = { firstName: "Jane", surname: "Doe" };
    const result = primaryParentSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe("Jane");
      expect(result.data.surname).toBe("Doe");
    }
  });

  it("degrades a missing or null field instead of failing the record", () => {
    // 2026-09-17: these fields used to be `z.string().optional()`, which
    // accepts `undefined` but REJECTS `null`. One null field failed the whole
    // object, `parseJsonField` returned its blank fallback, and the enrolment
    // PDF printed an EMPTY Primary Parent section for a family whose details
    // the dashboard was showing in full. A stored blob written by several code
    // paths over two years has to render what it has.
    const missingFirstName = primaryParentSchema.safeParse({ surname: "Doe" });
    expect(missingFirstName.success).toBe(true);
    if (missingFirstName.success) {
      expect(missingFirstName.data.firstName).toBe("");
      expect(missingFirstName.data.surname).toBe("Doe");
    }

    const nullCrn = primaryParentSchema.safeParse({
      firstName: "Jane",
      surname: "Doe",
      email: "jane@example.com",
      crn: null,
    });
    expect(nullCrn.success).toBe(true);
    if (nullCrn.success) {
      // The null field drops itself; its siblings survive.
      expect(nullCrn.data.crn).toBeUndefined();
      expect(nullCrn.data.email).toBe("jane@example.com");
    }
  });

  it("passes through extra fields", () => {
    const input = {
      firstName: "Jane",
      surname: "Doe",
      extraField: "some-value",
    };
    const result = primaryParentSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });
});

// ---------------------------------------------------------------------------
// reportChecklistSchema
// ---------------------------------------------------------------------------

describe("reportChecklistSchema", () => {
  it("accepts Record<string, boolean>", () => {
    const input = { "action-0": true, "action-1": false, "action-2": true };
    const result = reportChecklistSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it("rejects non-boolean values", () => {
    const input = { "action-0": "yes", "action-1": 1 };
    const result = reportChecklistSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// emailBlockSchema
// ---------------------------------------------------------------------------

describe("emailBlockSchema", () => {
  it("accepts valid block", () => {
    const input = { type: "heading", text: "Welcome", level: "h1" };
    const result = emailBlockSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe("heading");
      expect(result.data.text).toBe("Welcome");
    }
  });

  it("rejects invalid block type", () => {
    const input = { type: "video", text: "Watch now" };
    const result = emailBlockSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// gettingStartedProgressSchema
// ---------------------------------------------------------------------------

describe("gettingStartedProgressSchema", () => {
  it("accepts Record<string, boolean>", () => {
    const input = { step1: true, step2: false, step3: true };
    const result = gettingStartedProgressSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it("rejects non-boolean values", () => {
    const input = { step1: "done", step2: 0 };
    const result = gettingStartedProgressSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
