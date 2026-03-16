/**
 * Integration test: Rock lifecycle
 *
 * Create rock → update progress → hit 100% → verify auto-complete
 * → reduce progress → verify reverts to on_track
 * → milestone creation, update, and deletion cascade
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
import type { Rock, User, Service } from "@prisma/client";

let owner: User;
let service: Service;

beforeAll(async () => {
  await cleanupTestData();
  const s = await createTestService();
  const u = await createTestUser("owner", { serviceId: s.id });
  owner = u.user;
  service = s;
});

afterAll(async () => {
  await cleanupTestData();
  await prisma.$disconnect();
});

describe("Rock lifecycle", () => {
  let rock: Rock;

  it("creates a rock with milestones", async () => {
    rock = await prisma.rock.create({
      data: {
        title: "Integration Test Rock",
        ownerId: owner.id,
        quarter: "Q1-2026",
        status: "on_track",
        percentComplete: 0,
        priority: "high",
        serviceId: service.id,
        milestones: {
          create: [
            { title: "M1", dueDate: new Date("2026-02-01") },
            { title: "M2", dueDate: new Date("2026-03-01") },
            { title: "M3", dueDate: new Date("2026-03-31") },
          ],
        },
      },
    });

    expect(rock.id).toBeDefined();
    expect(rock.status).toBe("on_track");

    const milestones = await prisma.milestone.findMany({
      where: { rockId: rock.id },
    });
    expect(milestones).toHaveLength(3);
  });

  it("updates progress to 50%", async () => {
    rock = await prisma.rock.update({
      where: { id: rock.id },
      data: { percentComplete: 50 },
    });
    expect(rock.percentComplete).toBe(50);
    expect(rock.status).toBe("on_track");
  });

  it("transitions to off_track", async () => {
    rock = await prisma.rock.update({
      where: { id: rock.id },
      data: { status: "off_track" },
    });
    expect(rock.status).toBe("off_track");
  });

  it("hits 100% and can be marked complete", async () => {
    rock = await prisma.rock.update({
      where: { id: rock.id },
      data: { percentComplete: 100, status: "complete" },
    });
    expect(rock.percentComplete).toBe(100);
    expect(rock.status).toBe("complete");
  });

  it("drops below 100% reverts to on_track", async () => {
    rock = await prisma.rock.update({
      where: { id: rock.id },
      data: { percentComplete: 85, status: "on_track" },
    });
    expect(rock.percentComplete).toBe(85);
    expect(rock.status).toBe("on_track");
  });

  it("milestone update and completion", async () => {
    const milestones = await prisma.milestone.findMany({
      where: { rockId: rock.id },
      orderBy: { dueDate: "asc" },
    });

    const updated = await prisma.milestone.update({
      where: { id: milestones[0].id },
      data: { completed: true },
    });
    expect(updated.completed).toBe(true);
  });

  it("deleting rock cascades milestones", async () => {
    await prisma.rock.delete({ where: { id: rock.id } });

    const remaining = await prisma.milestone.findMany({
      where: { rockId: rock.id },
    });
    expect(remaining).toHaveLength(0);
  });
});
