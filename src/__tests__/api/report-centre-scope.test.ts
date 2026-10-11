import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession, mockNoSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";
import { _clearRoomNameCache } from "@/lib/room-names";
import { NO_SERVICE_MATCH } from "@/lib/authz-scope";
import { GET as attendance } from "@/app/api/reports/attendance/route";
import { GET as attendanceCsv } from "@/app/api/reports/attendance/export/route";
import { GET as revenue } from "@/app/api/reports/revenue/route";
import { GET as revenueCsv } from "@/app/api/reports/revenue/export/route";
import { GET as bookings } from "@/app/api/reports/bookings/route";
import { GET as enrolments } from "@/app/api/reports/enrolments/route";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ limited: false })) }));

const member = { id: "report-member", name: "Director", role: "member" as const, serviceId: "centre-a" };
const range = "dateFrom=2026-10-01&dateTo=2026-10-07";
const routes = [
  { path: "attendance", get: attendance, kind: "attendance" },
  { path: "attendance/export", get: attendanceCsv, kind: "attendance" },
  { path: "revenue", get: revenue, kind: "revenue" },
  { path: "revenue/export", get: revenueCsv, kind: "revenue" },
  { path: "bookings", get: bookings, kind: "bookings" },
  { path: "enrolments", get: enrolments, kind: "enrolments" },
];

function reportCalls(kind: string) {
  if (kind === "attendance") return [...prismaMock.booking.count.mock.calls, ...prismaMock.booking.groupBy.mock.calls, ...prismaMock.attendanceRecord.findMany.mock.calls];
  if (kind === "bookings") return [...prismaMock.booking.count.mock.calls, ...prismaMock.booking.groupBy.mock.calls, ...prismaMock.booking.findMany.mock.calls];
  if (kind === "enrolments") return [...prismaMock.enrolmentApplication.count.mock.calls, ...prismaMock.enrolmentApplication.groupBy.mock.calls, ...prismaMock.enrolmentApplication.findMany.mock.calls];
  return [...prismaMock.statement.findMany.mock.calls, ...prismaMock.statement.count.mock.calls, ...prismaMock.payment.findMany.mock.calls];
}

function firstQueryCalls(kind: string) {
  if (kind === "attendance") return prismaMock.attendanceRecord.findMany.mock.calls;
  if (kind === "bookings") return prismaMock.booking.count.mock.calls;
  if (kind === "enrolments") return prismaMock.enrolmentApplication.count.mock.calls;
  return prismaMock.payment.findMany.mock.calls;
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearUserActiveCache();
  _clearRoomNameCache();
  mockSession(member);
  prismaMock.user.findUnique.mockResolvedValue({ active: true });
  prismaMock.booking.count.mockResolvedValue(0);
  prismaMock.booking.groupBy.mockResolvedValue([]);
  prismaMock.booking.findMany.mockResolvedValue([]);
  prismaMock.enrolmentApplication.count.mockResolvedValue(0);
  prismaMock.enrolmentApplication.groupBy.mockResolvedValue([]);
  prismaMock.enrolmentApplication.findMany.mockResolvedValue([]);
  prismaMock.attendanceRecord.findMany.mockResolvedValue([]);
  prismaMock.statement.findMany.mockResolvedValue([]);
  prismaMock.statement.count.mockResolvedValue(0);
  prismaMock.payment.findMany.mockResolvedValue([]);
  prismaMock.room.findMany.mockResolvedValue([]);
});

describe.each(routes)("report centre boundary: $path", ({ path, get, kind }) => {
  it.each([
    ["", "centre-a"],
    ["&serviceId=centre-a", "centre-a"],
    ["&serviceId=centre-b", NO_SERVICE_MATCH],
  ])("constrains every query for member filter %s", async (filter, expected) => {
    const response = await get(createRequest("GET", `/api/reports/${path}?${range}${filter}`));
    expect(response.status).toBe(200);
    const calls = reportCalls(kind);
    expect(calls.length).toBeGreaterThan(0);
    for (const [args] of calls) expect(args.where.serviceId).toBe(expected);
  });

  it("fails closed without an assigned centre", async () => {
    mockSession({ ...member, serviceId: null });
    await get(createRequest("GET", `/api/reports/${path}?${range}`));
    const calls = firstQueryCalls(kind);
    expect(calls[0][0].where.serviceId).toBe(NO_SERVICE_MATCH);
  });

  it.each(["owner", "head_office", "admin"] as const)("preserves %s cross-centre access and requested filtering", async role => {
    mockSession({ ...member, role });
    await get(createRequest("GET", `/api/reports/${path}?${range}`));
    await get(createRequest("GET", `/api/reports/${path}?${range}&serviceId=centre-b`));
    const calls = firstQueryCalls(kind);
    expect(calls[0][0].where.serviceId).toBeUndefined();
    expect(calls[1][0].where.serviceId).toBe("centre-b");
  });

  it("denies anonymous access before querying report data", async () => {
    mockNoSession();
    expect((await get(createRequest("GET", `/api/reports/${path}?${range}`))).status).toBe(401);
    expect(prismaMock.attendanceRecord.findMany).not.toHaveBeenCalled();
    expect(prismaMock.statement.findMany).not.toHaveBeenCalled();
    expect(prismaMock.booking.count).not.toHaveBeenCalled();
    expect(prismaMock.enrolmentApplication.count).not.toHaveBeenCalled();
  });
});
