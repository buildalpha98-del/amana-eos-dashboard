/**
 * Induction gate library — readiness + clearance enforcement.
 *
 * The gate is the single source of truth for "may this user be rostered /
 * clock in". These tests pin: readiness blocker detection, published-only
 * course counting, the inert empty-curriculum gate, grace/override windows,
 * and the locked-mode helper.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import {
  getInductionReadiness,
  assertUserCleared,
  isInductionLocked,
} from "@/lib/induction";
import { ApiError } from "@/lib/api-error";

// A fully-ready world: all essentials done, WWCC on file, policies acked,
// profile complete. Individual tests knock out one pillar at a time.
function seedReadyWorld() {
  prismaMock.lMSCourse.findMany.mockResolvedValue([
    { id: "c1", title: "The Amana Way" },
  ]);
  prismaMock.lMSEnrollment.findMany.mockResolvedValue([
    { courseId: "c1", status: "completed" },
  ]);
  prismaMock.complianceCertificate.findFirst.mockResolvedValue({ id: "cert1" });
  prismaMock.policyDocument.findMany.mockResolvedValue([
    { title: "Privacy Policy", currentVersionId: "v1" },
  ]);
  prismaMock.policyDocumentAcknowledgement.findMany.mockResolvedValue([
    { versionId: "v1" },
  ]);
  prismaMock.user.findUnique.mockResolvedValue({
    inductionStatus: "in_training",
    inductionGraceUntil: null,
    inductionOverrideUntil: null,
    avatar: "https://x/pic.png",
    phone: "0400000000",
    _count: { emergencyContacts: 1 },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  seedReadyWorld();
});

describe("getInductionReadiness", () => {
  it("ready when all pillars satisfied", async () => {
    const r = await getInductionReadiness("u1");
    expect(r.ready).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it("blocks on incomplete essential courses", async () => {
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([]); // nothing completed
    const r = await getInductionReadiness("u1");
    expect(r.ready).toBe(false);
    expect(r.blockers.map((b) => b.kind)).toContain("courses");
  });

  it("blocks on missing WWCC", async () => {
    prismaMock.complianceCertificate.findFirst.mockResolvedValue(null);
    const r = await getInductionReadiness("u1");
    expect(r.blockers.map((b) => b.kind)).toContain("wwcc");
  });

  it("blocks on unacknowledged required policies", async () => {
    prismaMock.policyDocumentAcknowledgement.findMany.mockResolvedValue([]);
    const r = await getInductionReadiness("u1");
    expect(r.blockers.map((b) => b.kind)).toContain("policies");
  });

  it("blocks on incomplete profile (no avatar)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      avatar: null,
      phone: "0400000000",
      _count: { emergencyContacts: 1 },
    });
    const r = await getInductionReadiness("u1");
    expect(r.blockers.map((b) => b.kind)).toContain("profile");
  });

  it("blocks on incomplete profile (no emergency contact)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      avatar: "https://x/pic.png",
      phone: "0400000000",
      _count: { emergencyContacts: 0 },
    });
    const r = await getInductionReadiness("u1");
    expect(r.blockers.map((b) => b.kind)).toContain("profile");
  });

  it("counts only PUBLISHED essential courses (a draft never blocks)", async () => {
    // findMany is called with status:published filter — the lib passes that
    // filter, so a draft course simply isn't returned here. Simulate: the
    // only published essential is completed → ready.
    prismaMock.lMSCourse.findMany.mockResolvedValue([
      { id: "c1", title: "Published One" },
    ]);
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([
      { courseId: "c1", status: "completed" },
    ]);
    const r = await getInductionReadiness("u1");
    expect(r.blockers.map((b) => b.kind)).not.toContain("courses");
    // Assert the query filtered to published essentials.
    const call = prismaMock.lMSCourse.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ track: "essential", status: "published" });
  });

  it("empty essential curriculum → inert (courses never blocks)", async () => {
    prismaMock.lMSCourse.findMany.mockResolvedValue([]);
    prismaMock.lMSEnrollment.findMany.mockResolvedValue([]);
    const r = await getInductionReadiness("u1");
    expect(r.blockers.map((b) => b.kind)).not.toContain("courses");
  });
});

describe("assertUserCleared", () => {
  it("passes when status is cleared (no readiness check needed)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      inductionStatus: "cleared",
      inductionGraceUntil: null,
      inductionOverrideUntil: null,
    });
    await expect(assertUserCleared("u1")).resolves.toBeUndefined();
  });

  it("passes when grace window is in the future", async () => {
    const future = new Date(Date.now() + 86400000);
    prismaMock.user.findUnique.mockResolvedValue({
      inductionStatus: "in_training",
      inductionGraceUntil: future,
      inductionOverrideUntil: null,
    });
    await expect(assertUserCleared("u1")).resolves.toBeUndefined();
  });

  it("passes when override window is in the future", async () => {
    const future = new Date(Date.now() + 3600000);
    prismaMock.user.findUnique.mockResolvedValue({
      inductionStatus: "in_training",
      inductionGraceUntil: null,
      inductionOverrideUntil: future,
    });
    await expect(assertUserCleared("u1")).resolves.toBeUndefined();
  });

  it("throws forbidden with blocker summary when not cleared and no window", async () => {
    // user.findUnique first returns induction fields, then readiness re-reads
    // it for profile — return a combined object with an incomplete pillar.
    prismaMock.user.findUnique.mockResolvedValue({
      inductionStatus: "in_training",
      inductionGraceUntil: null,
      inductionOverrideUntil: null,
      avatar: "https://x/pic.png",
      phone: "0400000000",
      _count: { emergencyContacts: 1 },
    });
    prismaMock.complianceCertificate.findFirst.mockResolvedValue(null); // WWCC blocker
    await expect(assertUserCleared("u1")).rejects.toBeInstanceOf(ApiError);
    await expect(assertUserCleared("u1")).rejects.toMatchObject({ status: 403 });
  });

  it("throws notFound when user missing", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(assertUserCleared("ghost")).rejects.toMatchObject({ status: 404 });
  });

  it("expired grace no longer passes (window in the past)", async () => {
    const past = new Date(Date.now() - 86400000);
    prismaMock.user.findUnique.mockResolvedValue({
      inductionStatus: "in_training",
      inductionGraceUntil: past,
      inductionOverrideUntil: null,
      avatar: null,
      phone: null,
      _count: { emergencyContacts: 0 },
    });
    await expect(assertUserCleared("u1")).rejects.toMatchObject({ status: 403 });
  });
});

describe("isInductionLocked", () => {
  const now = new Date("2026-07-07T00:00:00Z");
  const future = new Date("2026-08-01T00:00:00Z");
  const past = new Date("2026-06-01T00:00:00Z");

  it("new_starter is locked", () => {
    expect(isInductionLocked("new_starter", null, now)).toBe(true);
  });
  it("in_training with no grace is locked", () => {
    expect(isInductionLocked("in_training", null, now)).toBe(true);
  });
  it("in_training with future grace is NOT locked (backfilled, still working)", () => {
    expect(isInductionLocked("in_training", future, now)).toBe(false);
  });
  it("in_training with expired grace is locked", () => {
    expect(isInductionLocked("in_training", past, now)).toBe(true);
  });
  it("awaiting_signoff is NOT locked (training done, just waiting on sign-off)", () => {
    expect(isInductionLocked("awaiting_signoff", null, now)).toBe(false);
  });
  it("cleared is NOT locked", () => {
    expect(isInductionLocked("cleared", null, now)).toBe(false);
  });
  it("undefined status is NOT locked", () => {
    expect(isInductionLocked(undefined, null, now)).toBe(false);
  });
});
