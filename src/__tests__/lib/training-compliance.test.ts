import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prismaMock } from "../helpers/prisma-mock";

// Email + branding are external side-effects — stub them.
const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));
const getEmailBranding = vi.fn();
vi.mock("@/lib/email-branding", () => ({
  getEmailBranding: () => getEmailBranding(),
}));

import {
  getTrainingComplianceReport,
  sendTrainingReminders,
} from "@/lib/training-compliance";

const DAY = 24 * 60 * 60 * 1000;

// Enrolment fixtures shaped like the prisma select in the lib
// (completed-module counts come back via a filtered _count).
function enrolment(over: Partial<Record<string, unknown>>) {
  return {
    dueDate: null,
    status: "in_progress",
    user: { id: "u1", name: "Aisha Homsi", email: "aisha@x.com", role: "staff" },
    course: {
      id: "c1",
      title: "Child Safety & You",
      track: "essential",
      status: "published",
      _count: { modules: 2 },
    },
    _count: { moduleProgress: 1 },
    ...over,
  };
}

describe("training-compliance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T00:00:00Z"));
    getEmailBranding.mockResolvedValue({
      name: "Amana OSHC",
      primaryColor: "#004E64",
    });
    sendEmail.mockResolvedValue({ suppressed: [], sent: ["x@x.com"] });
  });
  afterEach(() => vi.useRealTimers());

  describe("getTrainingComplianceReport", () => {
    it("groups by staff, flags overdue vs due-soon, and computes progress", async () => {
      prismaMock.lMSEnrollment.findMany.mockResolvedValue([
        // u1: overdue essential (due day fully passed), 1/2 modules done
        enrolment({
          dueDate: new Date("2026-07-01T00:00:00Z"), // 8 days ago
          _count: { moduleProgress: 1 },
        }),
        // u1: monthly due in 3 days (due soon), 0/4 done
        enrolment({
          course: {
            id: "c2",
            title: "Anaphylaxis Refresher",
            track: "monthly",
            status: "published",
            _count: { modules: 4 },
          },
          dueDate: new Date(Date.now() + 3 * DAY),
          _count: { moduleProgress: 0 },
        }),
        // u2: essential, no due date → outstanding but not overdue/soon
        enrolment({
          user: { id: "u2", name: "Bilal Khan", email: "bilal@x.com", role: "staff" },
          dueDate: null,
          _count: { moduleProgress: 0 },
        }),
      ]);

      const report = await getTrainingComplianceReport();

      expect(report.totals).toEqual({
        staffBehind: 2,
        outstandingCourses: 3,
        overdueCourses: 1,
      });
      // u1 (has an overdue) sorts before u2 (none overdue)
      expect(report.rows[0].userId).toBe("u1");
      expect(report.rows[0].overdueCount).toBe(1);
      expect(report.rows[0].dueSoonCount).toBe(1);
      // overdue course sorts first within the staffer's list, 50% progress
      const first = report.rows[0].outstanding[0];
      expect(first.overdue).toBe(true);
      expect(first.progressPct).toBe(50);
      const soon = report.rows[0].outstanding[1];
      expect(soon.dueSoon).toBe(true);
      expect(soon.overdue).toBe(false);
      // u2's course: no due date → neither overdue nor due-soon
      expect(report.rows[1].outstanding[0].overdue).toBe(false);
      expect(report.rows[1].outstanding[0].dueSoon).toBe(false);
    });

    it("only targets active users' incomplete required published courses", async () => {
      prismaMock.lMSEnrollment.findMany.mockResolvedValue([]);
      await getTrainingComplianceReport();
      const where = prismaMock.lMSEnrollment.findMany.mock.calls[0][0].where;
      // Everything not completed counts — including `expired`, so a lapsed
      // enrolment can never silently vanish from the report.
      expect(where.status).toEqual({ not: "completed" });
      expect(where.user).toEqual({ active: true });
      expect(where.course.deleted).toBe(false);
      expect(where.course.status).toBe("published");
      expect(where.course.OR).toEqual([
        { track: { in: ["essential", "monthly"] } },
        { isRequired: true },
      ]);
    });

    it("treats a course due TODAY as due-soon, not overdue (midnight-stored dueDate)", async () => {
      prismaMock.lMSEnrollment.findMany.mockResolvedValue([
        // dueDate = midnight of today (2026-07-09) — deadline is end of day.
        enrolment({ dueDate: new Date("2026-07-09T00:00:00Z") }),
        // dueDate = midnight of yesterday — day fully passed → overdue.
        enrolment({
          user: { id: "u2", name: "Bilal Khan", email: "bilal@x.com", role: "staff" },
          dueDate: new Date("2026-07-08T00:00:00Z"),
        }),
      ]);
      const report = await getTrainingComplianceReport();
      const dueToday = report.rows.find((r) => r.userId === "u1")!.outstanding[0];
      expect(dueToday.overdue).toBe(false);
      expect(dueToday.dueSoon).toBe(true);
      const duePast = report.rows.find((r) => r.userId === "u2")!.outstanding[0];
      expect(duePast.overdue).toBe(true);
    });

    it("returns zero totals when nobody is behind", async () => {
      prismaMock.lMSEnrollment.findMany.mockResolvedValue([]);
      const report = await getTrainingComplianceReport();
      expect(report.totals.staffBehind).toBe(0);
      expect(report.rows).toEqual([]);
    });
  });

  describe("sendTrainingReminders", () => {
    it("emails each behind staffer plus an admin summary, counting suppression", async () => {
      prismaMock.lMSEnrollment.findMany.mockResolvedValue([
        enrolment({ dueDate: new Date("2026-07-01T00:00:00Z") }), // u1 overdue (8 days past)
        enrolment({
          user: { id: "u2", name: "Bilal Khan", email: "bilal@x.com", role: "staff" },
          dueDate: null,
        }),
      ]);
      prismaMock.user.findMany.mockResolvedValue([
        { name: "Daniel Owner", email: "daniel@x.com" },
      ]);
      // Second staffer's address is suppressed.
      sendEmail
        .mockResolvedValueOnce({ suppressed: [], sent: ["aisha@x.com"] })
        .mockResolvedValueOnce({ suppressed: ["bilal@x.com"], sent: [] })
        .mockResolvedValueOnce({ suppressed: [], sent: ["daniel@x.com"] });

      const res = await sendTrainingReminders();

      expect(sendEmail).toHaveBeenCalledTimes(3); // 2 staff + 1 admin
      expect(res.staffReminded).toBe(2);
      expect(res.overdueCourses).toBe(1);
      expect(res.emailsSent).toBe(2); // aisha + admin
      expect(res.emailsSuppressed).toBe(1); // bilal
      // Admin query targets admin roles only.
      const adminWhere = prismaMock.user.findMany.mock.calls[0][0].where;
      expect(adminWhere.role).toEqual({
        in: ["owner", "admin", "head_office"],
      });
    });

    it("sends nothing when all staff are up to date", async () => {
      prismaMock.lMSEnrollment.findMany.mockResolvedValue([]);
      const res = await sendTrainingReminders();
      expect(sendEmail).not.toHaveBeenCalled();
      expect(res).toMatchObject({ staffReminded: 0, emailsSent: 0 });
    });
  });
});
