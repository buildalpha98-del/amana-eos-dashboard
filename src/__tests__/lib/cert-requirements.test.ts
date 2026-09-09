import { describe, it, expect } from "vitest";

import { getRequiredCertTypes } from "@/lib/cert-requirements";
import {
  CORE_CHILD_FACING_CERT_TYPES,
  ORG_SETTINGS_DEFAULTS,
  REQUIRED_CERTS_BY_ROLE_DEFAULTS,
} from "@/lib/org-settings-shared";

/**
 * Phase 9 (Staff Portal v2): the ONE shared resolver for which certificate
 * types a role must hold. Consumed client-side (via the
 * /api/org-settings/config slice) and server-side (via getOrgSettings) —
 * so it must be pure, defensive, and never throw.
 */

describe("getRequiredCertTypes — defaults", () => {
  it("returns the 5 core child-facing types for staff with no settings", () => {
    expect(getRequiredCertTypes("staff")).toEqual([
      "wwcc",
      "first_aid",
      "cpr",
      "anaphylaxis",
      "child_protection",
    ]);
  });

  it("returns the same core set for member (OSHC Coordinator)", () => {
    expect(getRequiredCertTypes("member", null)).toEqual([
      ...CORE_CHILD_FACING_CERT_TYPES,
    ]);
  });

  it.each(["owner", "head_office", "admin", "marketing", "eos_viewer", "eos_implementer", "eos"])(
    "returns an empty list for office role %s by default",
    (role) => {
      expect(getRequiredCertTypes(role)).toEqual([]);
    },
  );

  it("resolves defaults from ORG_SETTINGS_DEFAULTS identically to no settings at all", () => {
    for (const role of Object.keys(REQUIRED_CERTS_BY_ROLE_DEFAULTS)) {
      expect(getRequiredCertTypes(role, ORG_SETTINGS_DEFAULTS)).toEqual(
        getRequiredCertTypes(role),
      );
    }
  });
});

describe("getRequiredCertTypes — custom settings", () => {
  it("honours a customised list for a role", () => {
    const settings = {
      compliance: {
        requiredCertsByRole: { staff: ["wwcc", "asthma"] },
      },
    };
    expect(getRequiredCertTypes("staff", settings)).toEqual(["wwcc", "asthma"]);
  });

  it("honours an explicitly EMPTY list (no requirements is a valid choice)", () => {
    const settings = {
      compliance: { requiredCertsByRole: { staff: [] } },
    };
    expect(getRequiredCertTypes("staff", settings)).toEqual([]);
  });

  it("falls back to the role default when the role key is absent from settings", () => {
    const settings = {
      compliance: { requiredCertsByRole: { admin: ["police_check"] } },
    };
    expect(getRequiredCertTypes("staff", settings)).toEqual([
      ...CORE_CHILD_FACING_CERT_TYPES,
    ]);
    expect(getRequiredCertTypes("admin", settings)).toEqual(["police_check"]);
  });

  it("drops unknown cert types and duplicates from a stale/corrupt document", () => {
    const settings = {
      compliance: {
        requiredCertsByRole: {
          staff: ["wwcc", "not_a_cert", "wwcc", 42, null, "cpr"],
        },
      },
    };
    expect(getRequiredCertTypes("staff", settings)).toEqual(["wwcc", "cpr"]);
  });

  it("never resolves 'other' as a required type (excluded from the canonical list)", () => {
    const settings = {
      compliance: { requiredCertsByRole: { staff: ["other", "wwcc"] } },
    };
    expect(getRequiredCertTypes("staff", settings)).toEqual(["wwcc"]);
  });
});

describe("getRequiredCertTypes — unknown / missing role", () => {
  it("returns [] for an unknown role string", () => {
    expect(getRequiredCertTypes("coordinator")).toEqual([]);
    expect(getRequiredCertTypes("parent", ORG_SETTINGS_DEFAULTS)).toEqual([]);
  });

  it("returns [] for null/undefined/empty role", () => {
    expect(getRequiredCertTypes(null)).toEqual([]);
    expect(getRequiredCertTypes(undefined)).toEqual([]);
    expect(getRequiredCertTypes("")).toEqual([]);
  });

  it("ignores prototype-pollution style role names", () => {
    expect(getRequiredCertTypes("__proto__")).toEqual([]);
    expect(getRequiredCertTypes("constructor")).toEqual([]);
  });
});
