import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createTestService, createTestUser } from "@/lib/test-utils";
import { mockSession } from "../../src/__tests__/helpers/auth-mock";
import { createRequest } from "../../src/__tests__/helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { _clearRoomNameCache } from "@/lib/room-names";
import { GET as attendance } from "@/app/api/reports/attendance/route";
import { GET as attendanceCsv } from "@/app/api/reports/attendance/export/route";
import { GET as revenue } from "@/app/api/reports/revenue/route";
import { GET as revenueCsv } from "@/app/api/reports/revenue/export/route";
import { GET as bookings } from "@/app/api/reports/bookings/route";
import { GET as enrolments } from "@/app/api/reports/enrolments/route";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));

const ids: string[] = [], userIds: string[] = [];
let member: User, owner: User, unassigned: User;
const date = new Date("2026-10-05T08:00:00Z");
const range = "dateFrom=2026-10-01&dateTo=2026-10-07";
const context = { params: Promise.resolve({}) };

beforeAll(async () => {
  const db = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(db.hostname) || !db.pathname.endsWith("_test")) throw new Error("Requires an isolated local test database");
  for (const [name, count, fees, payment] of [["Scope Alpha", 1, 100, 12], ["Scope Beta", 2, 900, 90]] as const) {
    const service = await createTestService({ name }); ids.push(service.id);
    const room = await prisma.room.create({ data: { serviceId: service.id, name: `${name} Room`, legacyKey: "asc" } });
    const contact = await prisma.centreContact.create({ data: { serviceId: service.id, email: `${service.id}@example.test` } });
    const submission = await prisma.enrolmentSubmission.create({ data: { serviceId: service.id, primaryParent: {}, children: [], emergencyContacts: [], consents: {}, status: "submitted" } });
    for (let n = 0; n < count; n++) {
      const child = await prisma.child.create({ data: { serviceId: service.id, enrolmentId: submission.id, firstName: "Synthetic", surname: `${name}${n}`, culturalBackground: [], medicalConditions: [] } });
      await prisma.booking.create({ data: { serviceId: service.id, childId: child.id, roomId: room.id, date, sessionType: "asc", status: "confirmed" } });
      await prisma.attendanceRecord.create({ data: { serviceId: service.id, childId: child.id, roomId: room.id, date, sessionType: "asc", signInTime: date, status: "present" } });
    }
    await prisma.statement.create({ data: { serviceId: service.id, contactId: contact.id, periodStart: date, periodEnd: date, totalFees: fees, gapFee: fees, balance: fees, status: "issued" } });
    // A valid payment need not be allocated to a statement.
    await prisma.payment.create({ data: { serviceId: service.id, contactId: contact.id, amount: payment, method: "bank_transfer", receivedAt: date } });
    await prisma.enrolmentApplication.create({ data: { serviceId: service.id, familyId: contact.id, childFirstName: "Synthetic", childLastName: name, childDateOfBirth: new Date("2020-01-01"), sessionTypes: ["ASC"], medicalConditions: [], dietaryRequirements: [], createdAt: date } });
  }
  member = (await createTestUser("member", { serviceId: ids[0] })).user;
  userIds.push(member.id);
  owner = (await createTestUser("owner")).user;
  userIds.push(owner.id);
  unassigned = (await createTestUser("member")).user;
  userIds.push(unassigned.id);
});

beforeEach(() => { _clearUserActiveCache(); _clearRoomNameCache(); });
afterAll(async () => {
  await prisma.enrolmentApplication.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.statement.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.attendanceRecord.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.booking.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.child.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.enrolmentSubmission.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.centreContact.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.room.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.service.deleteMany({ where: { id: { in: ids } } });
});

describe("real report responses preserve the centre boundary", () => {
  it.each(["member", "foreign", "unassigned", "owner", "owner-filter"])("%s sees only authorized report data", async mode => {
    mockSession(mode.startsWith("owner") ? owner : mode === "unassigned" ? unassigned : member);
    const requested = mode === "foreign" || mode === "owner-filter" ? `&serviceId=${ids[1]}` : "";
    const call = async (get: typeof attendance, path: string) => {
      const response = await get(createRequest("GET", `/api/reports/${path}?${range}${requested}`), context);
      expect(response.status).toBe(200); return response;
    };
    const expected = mode === "owner" ? [3, 1000, 102, 2] : mode === "owner-filter" ? [2, 900, 90, 1] : mode === "member" ? [1, 100, 12, 1] : [0, 0, 0, 0];
    const a = await (await call(attendance, "attendance")).json();
    const b = await (await call(bookings, "bookings")).json();
    const r = await (await call(revenue, "revenue")).json();
    const e = await (await call(enrolments, "enrolments")).json();
    expect(a.totalExpected).toBe(expected[0]); expect(a.totalSignedIn).toBe(expected[0]);
    expect(b.totalBookings).toBe(expected[0]); expect(e.totalApplications).toBe(expected[3]);
    expect(r.totalGrossFees).toBe(expected[1]); expect(r.totalPaymentsReceived).toBe(expected[2]);
    const aCsv = (await (await call(attendanceCsv, "attendance/export")).text()).split("\n");
    const rCsv = (await (await call(revenueCsv, "revenue/export")).text()).split("\n");
    if (expected[0] === 0) { expect(aCsv).toHaveLength(1); expect(rCsv).toHaveLength(1); }
    else {
      expect(Number(aCsv[1].split(",")[1])).toBe(expected[0]);
      expect(Number(rCsv[1].split(",")[1])).toBe(expected[1]);
      expect(Number(rCsv[1].split(",")[4])).toBe(expected[2]);
    }
    if (mode === "member") { expect(JSON.stringify([a, b, e, r])).not.toContain("Scope Beta"); }
  });
});
