/**
 * Test data factory — populates a test database with realistic data.
 *
 * Creates:
 *   - 7 users (one per role)
 *   - 5 services across NSW and VIC
 *   - 1 active quarter with 5 rocks
 *   - 10 todos linked to rocks/users
 *   - 5 issues at various priorities
 *   - 3 scorecard measurables with entries
 *   - 5 parent enquiries at various stages
 *   - Leave requests in various states
 */

import { prisma } from "@/lib/prisma";
import { hashSync } from "bcryptjs";
import type { Role } from "@prisma/client";

const PASSWORD_HASH = hashSync("TestPassword123!", 10);

const ROLES: Role[] = [
  "owner",
  "head_office",
  "admin",
  "marketing",
  "member",
  "member",
  "staff",
];

export async function seedTestData() {
  // ── 1. Services ──────────────────────────────────────────
  const services = await Promise.all([
    prisma.service.create({
      data: {
        name: "Test OSHC Beaumont Hills",
        code: "test-beaumont-hills",
        state: "NSW",
        address: "1 Test Rd",
        suburb: "Beaumont Hills",
        postcode: "2155",
        capacity: 60,
        status: "active",
        bscDailyRate: 25,
        ascDailyRate: 30,
        vcDailyRate: 65,
        operatingDays: "Mon,Tue,Wed,Thu,Fri",
      },
    }),
    prisma.service.create({
      data: {
        name: "Test OSHC Greenacre",
        code: "test-greenacre",
        state: "NSW",
        address: "2 Test Rd",
        suburb: "Greenacre",
        postcode: "2190",
        capacity: 45,
        status: "active",
        bscDailyRate: 22,
        ascDailyRate: 28,
        vcDailyRate: 60,
        operatingDays: "Mon,Tue,Wed,Thu,Fri",
      },
    }),
    prisma.service.create({
      data: {
        name: "Test OSHC Al-Taqwa",
        code: "test-al-taqwa",
        state: "VIC",
        address: "3 Test Rd",
        suburb: "Truganina",
        postcode: "3029",
        capacity: 80,
        status: "active",
        bscDailyRate: 24,
        ascDailyRate: 29,
        vcDailyRate: 62,
        operatingDays: "Mon,Tue,Wed,Thu,Fri",
      },
    }),
    prisma.service.create({
      data: {
        name: "Test OSHC Minaret Officer",
        code: "test-minaret-officer",
        state: "VIC",
        address: "4 Test Rd",
        suburb: "Officer",
        postcode: "3809",
        capacity: 50,
        status: "active",
        bscDailyRate: 23,
        ascDailyRate: 27,
        vcDailyRate: 58,
        operatingDays: "Mon,Tue,Wed,Thu,Fri",
      },
    }),
    prisma.service.create({
      data: {
        name: "Test OSHC Unity Grammar",
        code: "test-unity-grammar",
        state: "NSW",
        address: "5 Test Rd",
        suburb: "Austral",
        postcode: "2179",
        capacity: 40,
        status: "onboarding",
        bscDailyRate: 25,
        ascDailyRate: 30,
        vcDailyRate: 65,
        operatingDays: "Mon,Tue,Wed,Thu,Fri",
      },
    }),
  ]);

  // ── 2. Users ─────────────────────────────────────────────
  const users = await Promise.all(
    ROLES.map((role, i) =>
      prisma.user.create({
        data: {
          name: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
          email: `test-${role}@amana-test.local`,
          passwordHash: PASSWORD_HASH,
          role,
          serviceId: ["member", "staff"].includes(role)
            ? services[0].id
            : null,
          state: i < 4 ? "NSW" : "VIC",
        },
      }),
    ),
  );

  const ownerId = users[0].id;
  const adminId = users[2].id;
  const coordinatorId = users[4].id;
  const memberId = users[5].id;
  const staffId = users[6].id;

  // ── 3. Rocks ─────────────────────────────────────────────
  const quarter = "Q1-2026";
  const rocks = await Promise.all([
    prisma.rock.create({
      data: {
        title: "Launch 2 new services",
        ownerId,
        quarter,
        status: "on_track",
        percentComplete: 60,
        priority: "critical",
        rockType: "company",
        milestones: {
          create: [
            { title: "Identify locations", dueDate: new Date("2026-01-31") },
            { title: "Sign contracts", dueDate: new Date("2026-02-28") },
            { title: "First session", dueDate: new Date("2026-03-31") },
          ],
        },
      },
    }),
    prisma.rock.create({
      data: {
        title: "Achieve 90% occupancy",
        ownerId: adminId,
        quarter,
        status: "off_track",
        percentComplete: 35,
        priority: "high",
        rockType: "company",
      },
    }),
    prisma.rock.create({
      data: {
        title: "Staff onboarding system",
        ownerId: coordinatorId,
        quarter,
        status: "on_track",
        percentComplete: 80,
        priority: "medium",
        rockType: "personal",
        serviceId: services[0].id,
      },
    }),
    prisma.rock.create({
      data: {
        title: "Marketing rebrand",
        ownerId: users[3].id,
        quarter,
        status: "on_track",
        percentComplete: 50,
        priority: "high",
        rockType: "company",
      },
    }),
    prisma.rock.create({
      data: {
        title: "Complete compliance audit",
        ownerId: memberId,
        quarter,
        status: "complete",
        percentComplete: 100,
        priority: "critical",
        rockType: "personal",
        serviceId: services[0].id,
      },
    }),
  ]);

  // ── 4. Todos ─────────────────────────────────────────────
  const today = new Date();
  const nextWeek = new Date(today.getTime() + 7 * 86400_000);

  await Promise.all([
    ...Array.from({ length: 5 }, (_, i) =>
      prisma.todo.create({
        data: {
          title: `Rock todo ${i + 1}`,
          assigneeId: users[i % users.length].id,
          rockId: rocks[i % rocks.length].id,
          dueDate: i < 3 ? today : nextWeek,
          weekOf: today,
          status: i === 0 ? "complete" : "pending",
        },
      }),
    ),
    ...Array.from({ length: 5 }, (_, i) =>
      prisma.todo.create({
        data: {
          title: `Standalone todo ${i + 1}`,
          assigneeId: users[(i + 2) % users.length].id,
          dueDate: nextWeek,
          weekOf: today,
          status: "pending",
          serviceId: services[0].id,
        },
      }),
    ),
  ]);

  // ── 5. Issues ────────────────────────────────────────────
  const priorities = ["critical", "high", "medium", "low", "medium"] as const;
  await Promise.all(
    priorities.map((priority, i) =>
      prisma.issue.create({
        data: {
          title: `Test issue ${i + 1}`,
          description: `Description for issue ${i + 1}`,
          priority,
          raisedById: users[i % users.length].id,
          ownerId: users[(i + 1) % users.length].id,
          rockId: i < 3 ? rocks[i].id : null,
          status: i === 0 ? "solved" : "open",
        },
      }),
    ),
  );

  // ── 6. Measurables ──────────────────────────────────────
  const scorecard = await prisma.scorecard.create({
    data: { title: "Test Scorecard" },
  });

  const measurables = await Promise.all([
    prisma.measurable.create({
      data: {
        title: "Weekly enrolments",
        ownerId,
        goalValue: 5,
        frequency: "weekly",
        unit: "number",
        scorecardId: scorecard.id,
      },
    }),
    prisma.measurable.create({
      data: {
        title: "Occupancy %",
        ownerId: adminId,
        goalValue: 90,
        frequency: "weekly",
        unit: "percentage",
        scorecardId: scorecard.id,
        serviceId: services[0].id,
      },
    }),
    prisma.measurable.create({
      data: {
        title: "Parent NPS",
        ownerId: coordinatorId,
        goalValue: 60,
        frequency: "weekly",
        unit: "number",
        scorecardId: scorecard.id,
        serviceId: services[0].id,
      },
    }),
  ]);

  // Add 4 weeks of entries per measurable
  for (const m of measurables) {
    for (let w = 0; w < 4; w++) {
      const weekDate = new Date(today.getTime() - w * 7 * 86400_000);
      await prisma.measurableEntry.create({
        data: {
          measurableId: m.id,
          value: Math.round(Math.random() * m.goalValue * 1.2),
          weekOf: weekDate,
          onTrack: Math.random() > 0.3,
          enteredById: ownerId,
        },
      });
    }
  }

  // ── 7. Enquiries ────────────────────────────────────────
  const stages = [
    "new_enquiry",
    "info_sent",
    "nurturing",
    "form_started",
    "enrolled",
  ];
  await Promise.all(
    stages.map((stage, i) =>
      prisma.parentEnquiry.create({
        data: {
          serviceId: services[i % services.length].id,
          parentName: `Enquiry Parent ${i + 1}`,
          parentEmail: `parent${i + 1}@test.local`,
          parentPhone: `040000000${i}`,
          childName: `Child ${i + 1}`,
          childAge: 6 + i,
          childrenDetails: [{ name: `Child ${i + 1}`, age: 6 + i }],
          channel: ["phone", "email", "whatsapp", "walkin", "referral"][i],
          stage,
          parentDriver: [
            "homework",
            "quran",
            "enrichment",
            "working_parent",
            "traffic",
          ][i],
          assigneeId: coordinatorId,
        },
      }),
    ),
  );

  // ── 8. Leave requests ───────────────────────────────────
  const leaveStatuses = [
    "leave_pending",
    "leave_approved",
    "leave_rejected",
    "leave_pending",
  ] as const;
  await Promise.all(
    leaveStatuses.map((status, i) =>
      prisma.leaveRequest.create({
        data: {
          userId: users[(i + 4) % users.length].id,
          leaveType: (["annual", "sick", "personal", "unpaid"] as const)[i],
          startDate: new Date(`2026-04-${10 + i}`),
          endDate: new Date(`2026-04-${11 + i}`),
          totalDays: 1,
          status,
          reason: `Test leave reason ${i + 1}`,
          reviewedById: status !== "leave_pending" ? adminId : null,
          reviewedAt: status !== "leave_pending" ? new Date() : null,
          serviceId: services[0].id,
        },
      }),
    ),
  );

  return { users, services, rocks, measurables };
}
