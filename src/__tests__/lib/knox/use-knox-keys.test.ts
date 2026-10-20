import { describe, it, expect, vi } from "vitest";

vi.mock("@/hooks/useToast", () => ({ toast: vi.fn() }));

import {
  acknowledgedAt,
  assessmentClocks,
  canUseKnox,
  knoxKeys,
  needsAcknowledgement,
  type KnoxAlert,
} from "@/hooks/useKnox";
import { KNOX_ROLES } from "@/app/api/knox/_lib";

/**
 * Query keys must be primitives only (CLAUDE.md: objects in keys cause cache
 * misses on re-render). Every knoxKeys helper is exercised with and without
 * its optional arguments.
 */
function expectStrings(key: unknown) {
  expect(Array.isArray(key)).toBe(true);
  for (const part of key as unknown[]) expect(typeof part).toBe("string");
}

describe("knoxKeys", () => {
  it("every helper returns an array of strings", () => {
    const samples: unknown[] = [
      knoxKeys.all(),
      knoxKeys.inbox(),
      knoxKeys.inbox("incident:abc"),
      knoxKeys.subject("incident", "abc"),
      knoxKeys.subject("complaint", "c1"),
      knoxKeys.tiers("complaint", ["b", "a"]),
      knoxKeys.tiers("staff_incident", []),
    ];
    for (const key of samples) expectStrings(key);
  });

  it("covers every exported helper", () => {
    // A new helper added without a sample above would slip past the check.
    expect(Object.keys(knoxKeys).sort()).toEqual(["all", "inbox", "subject", "tiers"]);
  });

  it("inbox key matches the brief and the subject slice shares it", () => {
    expect(knoxKeys.inbox()).toEqual(["knox", "inbox", ""]);
    expect(knoxKeys.subject("incident", "abc")).toEqual(knoxKeys.inbox("incident:abc"));
  });

  it("every key sits under the knox root so one invalidation refreshes all", () => {
    const root = knoxKeys.all();
    for (const key of [knoxKeys.inbox(), knoxKeys.subject("complaint", "c1"), knoxKeys.tiers("complaint", ["x"])]) {
      expect(key.slice(0, root.length)).toEqual(root);
    }
  });

  it("tiers key is order-independent so the same table never double-fetches", () => {
    expect(knoxKeys.tiers("complaint", ["b", "a"])).toEqual(knoxKeys.tiers("complaint", ["a", "b"]));
  });
});

const alert = (acknowledgedAtValue: string | null): KnoxAlert => ({
  id: Math.random().toString(36),
  channel: "push",
  escalationLevel: 0,
  recipientUserId: null,
  sentAt: "2026-10-20T00:00:00.000Z",
  delivered: true,
  acknowledgedAt: acknowledgedAtValue,
});

describe("acknowledge visibility", () => {
  it("shows Acknowledge only when alerts went out and none is acknowledged", () => {
    expect(needsAcknowledgement({ alerted: true, alerts: [alert(null)] })).toBe(true);
    // The ack route 409s with no alert rows — never offer the button then.
    expect(needsAcknowledgement({ alerted: false, alerts: [] })).toBe(false);
    expect(needsAcknowledgement({ alerted: true, alerts: [alert(null), alert("2026-10-20T01:00:00.000Z")] })).toBe(false);
  });

  it("reports the earliest acknowledgement time", () => {
    expect(
      acknowledgedAt({ alerts: [alert("2026-10-20T03:00:00.000Z"), alert("2026-10-20T01:00:00.000Z"), alert(null)] }),
    ).toBe("2026-10-20T01:00:00.000Z");
    expect(acknowledgedAt({ alerts: [alert(null)] })).toBeNull();
  });
});

describe("assessmentClocks", () => {
  it("keeps well-formed clocks and drops junk from the Json column", () => {
    expect(
      assessmentClocks({
        clocks: [
          { kind: "parent_24h", dueAt: "2026-10-21T00:00:00.000Z", basis: "Reg 86", overdue: false },
          { kind: "regulator" },
          null,
          "nope",
        ],
      }),
    ).toEqual([{ kind: "parent_24h", dueAt: "2026-10-21T00:00:00.000Z", basis: "Reg 86", overdue: false }]);
    expect(assessmentClocks({ clocks: null })).toEqual([]);
  });
});

describe("canUseKnox", () => {
  it("matches the API's KNOX_ROLES exactly, so hooks never fire a 403", () => {
    for (const role of ["owner", "head_office", "admin", "member", "eos", "staff", "marketing", "volunteer", "eos_viewer"]) {
      expect(canUseKnox(role)).toBe((KNOX_ROLES as string[]).includes(role));
    }
    expect(canUseKnox(undefined)).toBe(false);
  });
});
