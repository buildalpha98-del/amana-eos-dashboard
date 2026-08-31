/**
 * The three registers: visitors, staff incidents, illness.
 *
 * Each exists to be read back by someone official, so the tests pin the
 * things that would make them worthless: a visitor who left before they
 * arrived, a notifiable injury with no notification, an infectious case
 * where nobody can show when families were told, and records filed
 * against the wrong centre.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";
import { mockSession } from "../helpers/auth-mock";
import { createRequest } from "../helpers/request";
import { _clearUserActiveCache } from "@/lib/server-auth";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() =>
    Promise.resolve({ limited: false, remaining: 59, resetIn: 60_000 }),
  ),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequestId: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  generateRequestId: () => "test-req-id",
}));

import { POST as VISITOR_POST } from "@/app/api/services/[id]/visitors/route";
import { PATCH as VISITOR_PATCH } from "@/app/api/services/[id]/visitors/[visitorId]/route";
import {
  GET as STAFF_GET,
  POST as STAFF_POST,
} from "@/app/api/services/[id]/staff-incidents/route";
import {
  GET as ILL_GET,
  POST as ILL_POST,
} from "@/app/api/services/[id]/illness/route";
import { PATCH as ILL_PATCH } from "@/app/api/services/[id]/illness/[recordId]/route";

const ctx = (id = "svc-1") => ({ params: Promise.resolve({ id }) });
const ctxV = (visitorId = "v-1", id = "svc-1") => ({
  params: Promise.resolve({ id, visitorId }),
});
const ctxI = (recordId = "ill-1", id = "svc-1") => ({
  params: Promise.resolve({ id, recordId }),
});

describe("service registers", () => {
  beforeEach(() => {
    _clearUserActiveCache();
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ active: true });
  });

  describe("visitors", () => {
    it("an educator can sign a visitor in at the door", async () => {
      mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
      prismaMock.serviceVisitor.create.mockResolvedValue({ id: "v-1" });
      const res = await VISITOR_POST(
        createRequest("POST", "/x", {
          body: { name: "Ali Contractor", organisation: "FixIt", wwccSighted: true },
        }),
        ctx(),
      );
      expect(res.status).toBe(201);
      const data = prismaMock.serviceVisitor.create.mock.calls[0][0].data;
      expect(data.wwccSighted).toBe(true);
      expect(data.recordedById).toBe("u-ed");
    });

    it("refuses a sign-out earlier than the sign-in", async () => {
      mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
      prismaMock.serviceVisitor.findUnique.mockResolvedValue({
        id: "v-1",
        serviceId: "svc-1",
        signedInAt: new Date("2026-08-06T10:00:00Z"),
        signedOutAt: null,
      });
      const res = await VISITOR_PATCH(
        createRequest("PATCH", "/x", {
          body: { signOut: true, signedOutAt: "2026-08-06T09:00:00.000Z" },
        }),
        ctxV(),
      );
      expect(res.status).toBe(400);
      expect(prismaMock.serviceVisitor.update).not.toHaveBeenCalled();
    });

    it("keeps the first sign-out time when signed out twice", async () => {
      mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
      prismaMock.serviceVisitor.findUnique.mockResolvedValue({
        id: "v-1",
        serviceId: "svc-1",
        signedInAt: new Date("2026-08-06T10:00:00Z"),
        signedOutAt: new Date("2026-08-06T11:00:00Z"),
      });
      const res = await VISITOR_PATCH(
        createRequest("PATCH", "/x", { body: { signOut: true } }),
        ctxV(),
      );
      expect(res.status).toBe(200);
      expect(prismaMock.serviceVisitor.update).not.toHaveBeenCalled();
    });
  });

  describe("staff incidents", () => {
    it("a notifiable severity is reportable even if the box was left unticked", async () => {
      mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
      prismaMock.staffIncidentReport.create.mockResolvedValue({ id: "si-1" });
      await STAFF_POST(
        createRequest("POST", "/x", {
          body: {
            staffName: "Sarah",
            occurredAt: "2026-08-06T10:00:00.000Z",
            description: "Fell on wet floor",
            severity: "notifiable",
            reportableToAuthority: false,
          },
        }),
        ctx(),
      );
      const data = prismaMock.staffIncidentReport.create.mock.calls[0][0].data;
      // The two disagreeing is exactly how a notification gets missed.
      expect(data.reportableToAuthority).toBe(true);
    });

    it("counts notifiable incidents nobody has reported", async () => {
      mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
      prismaMock.staffIncidentReport.findMany.mockResolvedValue([
        {
          id: "a",
          staffName: "S",
          occurredAt: new Date(),
          incidentType: "injury",
          severity: "notifiable",
          location: null,
          description: "d",
          bodyPart: null,
          treatment: null,
          witnessNames: null,
          reportableToAuthority: true,
          reportedToAuthorityAt: null,
          workersCompClaim: false,
          followUpRequired: true,
          followUpCompleted: false,
          reportedBy: null,
          signedOffAt: null,
          signedOffBy: null,
        },
      ]);
      const body = await (await STAFF_GET(createRequest("GET", "/x"), ctx())).json();
      expect(body.notifiableUnreported).toBe(1);
      expect(body.openFollowUps).toBe(1);
    });

    it("is not readable by floor staff", async () => {
      mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
      const res = await STAFF_GET(createRequest("GET", "/x"), ctx());
      expect(res.status).toBe(403);
    });
  });

  describe("illness", () => {
    it("refuses a child from another centre", async () => {
      mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
      prismaMock.child.findUnique.mockResolvedValue({ serviceId: "svc-OTHER" });
      const res = await ILL_POST(
        createRequest("POST", "/x", {
          body: {
            personName: "Abdul",
            childId: "kid-elsewhere",
            illness: "Gastro",
            onsetDate: "2026-08-06",
          },
        }),
        ctx(),
      );
      expect(res.status).toBe(400);
      expect(prismaMock.illnessRecord.create).not.toHaveBeenCalled();
    });

    it("refuses a return date before onset", async () => {
      mockSession({ id: "u-ed", name: "Ed", role: "staff", serviceId: "svc-1" });
      const res = await ILL_POST(
        createRequest("POST", "/x", {
          body: {
            personName: "Abdul",
            illness: "Gastro",
            onsetDate: "2026-08-06",
            returnDate: "2026-08-01",
          },
        }),
        ctx(),
      );
      expect(res.status).toBe(400);
    });

    it("counts infectious cases where families haven't been told", async () => {
      mockSession({ id: "u-1", name: "Coord", role: "member", serviceId: "svc-1" });
      prismaMock.illnessRecord.findMany.mockResolvedValue([
        {
          id: "i1",
          personName: "A",
          personType: "child",
          childId: null,
          illness: "Gastro",
          infectious: true,
          onsetDate: new Date("2026-08-05"),
          excludedFrom: null,
          returnDate: null,
          symptoms: null,
          actionTaken: null,
          familiesNotifiedAt: null,
          notifiedBy: null,
          authorityNotifiedAt: null,
          notes: null,
          recordedBy: null,
        },
      ]);
      const body = await (await ILL_GET(createRequest("GET", "/x"), ctx())).json();
      expect(body.infectiousUnnotified).toBe(1);
    });

    it("stamps the notifier from the session and keeps the first notification", async () => {
      mockSession({ id: "u-coord", name: "Mirna", role: "member", serviceId: "svc-1" });
      prismaMock.illnessRecord.findUnique.mockResolvedValue({
        id: "ill-1",
        serviceId: "svc-1",
        onsetDate: new Date("2026-08-01"),
        familiesNotifiedAt: null,
      });
      prismaMock.illnessRecord.update.mockResolvedValue({ id: "ill-1" });
      await ILL_PATCH(
        createRequest("PATCH", "/x", {
          body: { notifyFamilies: true, notifiedById: "u-someone-else" },
        }),
        ctxI(),
      );
      const data = prismaMock.illnessRecord.update.mock.calls[0][0].data;
      expect(data.notifiedById).toBe("u-coord");
      expect(data.familiesNotifiedAt).toBeInstanceOf(Date);
    });

    it("does not overwrite an existing family notification date", async () => {
      mockSession({ id: "u-coord", name: "Mirna", role: "member", serviceId: "svc-1" });
      prismaMock.illnessRecord.findUnique.mockResolvedValue({
        id: "ill-1",
        serviceId: "svc-1",
        onsetDate: new Date("2026-08-01"),
        familiesNotifiedAt: new Date("2026-08-02"),
      });
      prismaMock.illnessRecord.update.mockResolvedValue({ id: "ill-1" });
      await ILL_PATCH(
        createRequest("PATCH", "/x", { body: { notifyFamilies: true } }),
        ctxI(),
      );
      const data = prismaMock.illnessRecord.update.mock.calls[0][0].data;
      // The date families were ACTUALLY told is the one that answers the
      // question months later.
      expect(data.familiesNotifiedAt).toBeUndefined();
    });
  });
});
