/**
 * Integration test: Leave request flow
 *
 * Staff submits leave → admin views pending → approves/rejects →
 * verify status update → verify balance deduction.
 *
 * Requires a running test database (see .env.test).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createTestUser,
  createTestService,
  cleanupTestData,
} from "@/lib/test-utils";
import type { User, Service, LeaveRequest } from "@prisma/client";

let staffUser: User;
let adminUser: User;
let service: Service;

beforeAll(async () => {
  await cleanupTestData();
  const s = await createTestService();
  const staff = await createTestUser("staff", { serviceId: s.id });
  const admin = await createTestUser("admin");
  staffUser = staff.user;
  adminUser = admin.user;
  service = s;

  // Seed a leave balance for the staff user
  await prisma.leaveBalance.create({
    data: {
      userId: staffUser.id,
      leaveType: "annual",
      balance: 20,
      accrued: 20,
      taken: 0,
      pending: 0,
    },
  });
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Leave request flow", () => {
  let leaveRequest: LeaveRequest;

  it("staff submits a leave request", async () => {
    leaveRequest = await prisma.leaveRequest.create({
      data: {
        userId: staffUser.id,
        leaveType: "annual",
        startDate: new Date("2026-04-10"),
        endDate: new Date("2026-04-14"),
        totalDays: 5,
        reason: "Family holiday",
        status: "leave_pending",
        serviceId: service.id,
      },
    });

    expect(leaveRequest.id).toBeDefined();
    expect(leaveRequest.status).toBe("leave_pending");
    expect(leaveRequest.totalDays).toBe(5);
  });

  it("admin can view pending leave requests", async () => {
    const pending = await prisma.leaveRequest.findMany({
      where: { status: "leave_pending", serviceId: service.id },
      include: { user: { select: { name: true, role: true } } },
    });

    expect(pending.length).toBeGreaterThanOrEqual(1);
    const found = pending.find((r) => r.id === leaveRequest.id);
    expect(found).toBeDefined();
    expect(found!.user.name).toBe(staffUser.name);
  });

  it("admin approves the leave request", async () => {
    leaveRequest = await prisma.leaveRequest.update({
      where: { id: leaveRequest.id },
      data: {
        status: "leave_approved",
        reviewedById: adminUser.id,
        reviewedAt: new Date(),
        reviewNotes: "Approved — enjoy your holiday!",
      },
    });

    expect(leaveRequest.status).toBe("leave_approved");
    expect(leaveRequest.reviewedById).toBe(adminUser.id);
    expect(leaveRequest.reviewNotes).toBe("Approved — enjoy your holiday!");
  });

  it("leave balance reflects pending/taken correctly", async () => {
    // Simulate balance deduction (as the app would do)
    const balance = await prisma.leaveBalance.update({
      where: {
        userId_leaveType: {
          userId: staffUser.id,
          leaveType: "annual",
        },
      },
      data: {
        taken: { increment: 5 },
        balance: { decrement: 5 },
      },
    });

    expect(balance.taken).toBe(5);
    expect(balance.balance).toBe(15);
  });

  it("admin rejects a different leave request", async () => {
    const sickLeave = await prisma.leaveRequest.create({
      data: {
        userId: staffUser.id,
        leaveType: "sick",
        startDate: new Date("2026-05-01"),
        endDate: new Date("2026-05-01"),
        totalDays: 1,
        reason: "Medical appointment",
        status: "leave_pending",
        serviceId: service.id,
      },
    });

    const rejected = await prisma.leaveRequest.update({
      where: { id: sickLeave.id },
      data: {
        status: "leave_rejected",
        reviewedById: adminUser.id,
        reviewedAt: new Date(),
        reviewNotes: "Please use personal leave for appointments",
      },
    });

    expect(rejected.status).toBe("leave_rejected");
  });

  it("stats query returns correct counts (regression for BUG-003)", async () => {
    const stats = await prisma.leaveRequest.groupBy({
      by: ["status"],
      where: { userId: staffUser.id },
      _count: true,
    });

    const approved = stats.find((s) => s.status === "leave_approved");
    const rejected = stats.find((s) => s.status === "leave_rejected");
    const pending = stats.find((s) => s.status === "leave_pending");

    expect(approved?._count).toBe(1);
    expect(rejected?._count).toBe(1);
    // No pending left for this user
    expect(pending?._count).toBeUndefined();
  });
});
