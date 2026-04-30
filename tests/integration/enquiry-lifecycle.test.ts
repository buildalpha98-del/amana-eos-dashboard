/**
 * Integration test: Parent enquiry lifecycle
 *
 * Create parent enquiry → add child details → process stages →
 * verify data carries through transitions.
 *
 * Requires a running test database (see .env.test).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createTestUser,
  createTestService,
  createTestEnquiry,
  cleanupTestData,
} from "@/lib/test-utils";
import type { User, Service, ParentEnquiry } from "@prisma/client";

let coordinator: User;
let service: Service;

beforeAll(async () => {
  await cleanupTestData();
  const s = await createTestService();
  const u = await createTestUser("member", { serviceId: s.id });
  coordinator = u.user;
  service = s;
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Enquiry lifecycle", () => {
  let enquiry: ParentEnquiry;

  it("creates a new enquiry with child data", async () => {
    enquiry = await createTestEnquiry(service.id, {
      parentName: "Sarah Ahmed",
      parentEmail: "sarah@test.local",
      channel: "phone",
    });

    expect(enquiry.id).toBeDefined();
    expect(enquiry.stage).toBe("new_enquiry");
    expect(enquiry.parentName).toBe("Sarah Ahmed");
    expect(enquiry.childrenDetails).toBeDefined();

    const children = enquiry.childrenDetails as Array<{ name: string; age: number }>;
    expect(children).toHaveLength(2);
  });

  it("transitions through stages: new_enquiry → info_sent → nurturing", async () => {
    enquiry = await prisma.parentEnquiry.update({
      where: { id: enquiry.id },
      data: { stage: "info_sent", assigneeId: coordinator.id },
    });
    expect(enquiry.stage).toBe("info_sent");
    expect(enquiry.assigneeId).toBe(coordinator.id);

    enquiry = await prisma.parentEnquiry.update({
      where: { id: enquiry.id },
      data: { stage: "nurturing", ccsEducated: true },
    });
    expect(enquiry.stage).toBe("nurturing");
    expect(enquiry.ccsEducated).toBe(true);
  });

  it("adds touchpoints throughout the journey", async () => {
    await prisma.parentEnquiryTouchpoint.create({
      data: {
        enquiryId: enquiry.id,
        type: "first_response",
        channel: "phone",
        content: "Called parent to introduce service",
        status: "sent",
        sentAt: new Date(),
      },
    });

    const touchpoints = await prisma.parentEnquiryTouchpoint.findMany({
      where: { enquiryId: enquiry.id },
    });
    expect(touchpoints).toHaveLength(1);
    expect(touchpoints[0].type).toBe("first_response");
  });

  it("progresses to form_started → enrolled", async () => {
    enquiry = await prisma.parentEnquiry.update({
      where: { id: enquiry.id },
      data: { stage: "form_started", formStarted: true },
    });
    expect(enquiry.formStarted).toBe(true);

    enquiry = await prisma.parentEnquiry.update({
      where: { id: enquiry.id },
      data: {
        stage: "enrolled",
        formCompleted: true,
        firstSessionDate: new Date("2026-04-01"),
      },
    });
    expect(enquiry.stage).toBe("enrolled");
    expect(enquiry.formCompleted).toBe(true);
    expect(enquiry.firstSessionDate).toEqual(new Date("2026-04-01"));
  });

  it("multi-child enquiry preserves all child data", async () => {
    const multiEnquiry = await prisma.parentEnquiry.create({
      data: {
        serviceId: service.id,
        parentName: "Multi Parent",
        parentEmail: "multi@test.local",
        channel: "email",
        childrenDetails: [
          { name: "Child A", age: 5 },
          { name: "Child B", age: 7 },
          { name: "Child C", age: 10 },
        ],
        stage: "new_enquiry",
      },
    });

    const children = multiEnquiry.childrenDetails as Array<{
      name: string;
      age: number;
    }>;
    expect(children).toHaveLength(3);
    expect(children[2].name).toBe("Child C");
    expect(children[2].age).toBe(10);
  });

  it("soft deletes enquiry without losing data", async () => {
    const deleted = await prisma.parentEnquiry.update({
      where: { id: enquiry.id },
      data: { deleted: true },
    });
    expect(deleted.deleted).toBe(true);

    // Still findable by ID
    const found = await prisma.parentEnquiry.findUnique({
      where: { id: enquiry.id },
    });
    expect(found).not.toBeNull();
    expect(found!.parentName).toBe("Sarah Ahmed");
  });
});
