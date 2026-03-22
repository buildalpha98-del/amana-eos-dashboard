import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

import {
  isEmailSuppressed,
  suppressEmail,
  getSuppressionList,
  removeFromSuppressionList,
} from "@/lib/email-suppression";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── isEmailSuppressed ─────────────────────────────────────

describe("isEmailSuppressed", () => {
  it("returns true when email is found on the suppression list", async () => {
    prismaMock.emailSuppression.findUnique.mockResolvedValue({
      id: "sup_1",
      email: "bounce@example.com",
      reason: "hard_bounce",
      source: "resend",
      createdAt: new Date(),
    });

    const result = await isEmailSuppressed("bounce@example.com");

    expect(result).toBe(true);
    expect(prismaMock.emailSuppression.findUnique).toHaveBeenCalledWith({
      where: { email: "bounce@example.com" },
    });
  });

  it("returns false when email is not found", async () => {
    prismaMock.emailSuppression.findUnique.mockResolvedValue(null);

    const result = await isEmailSuppressed("clean@example.com");

    expect(result).toBe(false);
  });

  it("lowercases email before lookup", async () => {
    prismaMock.emailSuppression.findUnique.mockResolvedValue(null);

    await isEmailSuppressed("User@Example.COM");

    expect(prismaMock.emailSuppression.findUnique).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });
  });
});

// ── suppressEmail ─────────────────────────────────────────

describe("suppressEmail", () => {
  it("calls upsert with lowercased email", async () => {
    prismaMock.emailSuppression.upsert.mockResolvedValue({});

    await suppressEmail("Bounce@Example.COM", "hard_bounce", "resend");

    expect(prismaMock.emailSuppression.upsert).toHaveBeenCalledWith({
      where: { email: "bounce@example.com" },
      update: {},
      create: {
        email: "bounce@example.com",
        reason: "hard_bounce",
        source: "resend",
      },
    });
  });

  it("includes reason and source in create payload", async () => {
    prismaMock.emailSuppression.upsert.mockResolvedValue({});

    await suppressEmail("user@test.com", "complaint", "webhook");

    const call = prismaMock.emailSuppression.upsert.mock.calls[0][0];
    expect(call.create.reason).toBe("complaint");
    expect(call.create.source).toBe("webhook");
  });

  it("sets source to null when not provided", async () => {
    prismaMock.emailSuppression.upsert.mockResolvedValue({});

    await suppressEmail("user@test.com", "manual_block");

    const call = prismaMock.emailSuppression.upsert.mock.calls[0][0];
    expect(call.create.source).toBeNull();
  });
});

// ── getSuppressionList ────────────────────────────────────

describe("getSuppressionList", () => {
  it("returns all suppressed emails ordered by createdAt desc", async () => {
    const list = [
      {
        id: "sup_2",
        email: "newer@example.com",
        reason: "complaint",
        source: null,
        createdAt: new Date("2026-03-22"),
      },
      {
        id: "sup_1",
        email: "older@example.com",
        reason: "hard_bounce",
        source: "resend",
        createdAt: new Date("2026-03-01"),
      },
    ];
    prismaMock.emailSuppression.findMany.mockResolvedValue(list);

    const result = await getSuppressionList();

    expect(result).toEqual(list);
    expect(prismaMock.emailSuppression.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
    });
  });
});

// ── removeFromSuppressionList ─────────────────────────────

describe("removeFromSuppressionList", () => {
  it("deletes by lowercased email", async () => {
    prismaMock.emailSuppression.deleteMany.mockResolvedValue({ count: 1 });

    await removeFromSuppressionList("User@Example.COM");

    expect(prismaMock.emailSuppression.deleteMany).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });
  });

  it("is a no-op for non-existent email (deleteMany returns count 0)", async () => {
    prismaMock.emailSuppression.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      removeFromSuppressionList("nonexistent@example.com"),
    ).resolves.toBeUndefined();

    expect(prismaMock.emailSuppression.deleteMany).toHaveBeenCalledWith({
      where: { email: "nonexistent@example.com" },
    });
  });
});
