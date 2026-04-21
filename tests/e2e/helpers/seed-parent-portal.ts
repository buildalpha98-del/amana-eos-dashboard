/**
 * Playwright seed helper — creates a known-state parent + child + magic link
 * so parent portal specs can authenticate deterministically (no real email).
 *
 * Usage in a spec's `test.beforeAll`:
 *   const seeded = await seedParent({});
 *   await saveParentSession(seeded, "./.playwright/auth/parent-portal.json");
 *   // Then in the spec:
 *   //   test.use({ storageState: "./.playwright/auth/parent-portal.json" });
 *   // Tests are now authenticated.
 */

import crypto from "crypto";
import { request as pwRequest } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

// Dedicated client — Playwright runs out-of-process from the app.
const prisma = new PrismaClient();

export interface SeededParent {
  email: string;
  parentName: string;
  serviceId: string;
  enrolmentId: string;
  childId: string;
  magicLinkId: string;
  rawToken: string;
}

export async function seedParent(input: {
  email?: string;
  parentFirstName?: string;
  parentLastName?: string;
  childFirstName?: string;
  childLastName?: string;
  serviceCode?: string;
}): Promise<SeededParent> {
  const unique = crypto.randomUUID().slice(0, 8);
  const email = (input.email ?? `e2e-parent+${unique}@amana-test.local`).toLowerCase();
  const parentFirstName = input.parentFirstName ?? "E2E";
  const parentLastName = input.parentLastName ?? "Parent";
  const childFirstName = input.childFirstName ?? "E2EChild";
  const childLastName = input.childLastName ?? "Surname";

  const service = await prisma.service.findFirstOrThrow({
    where: input.serviceCode ? { code: input.serviceCode } : {},
    select: { id: true },
  });

  const enrolment = await prisma.enrolmentSubmission.create({
    data: {
      serviceId: service.id,
      status: "processed",
      primaryParent: {
        firstName: parentFirstName,
        surname: parentLastName,
        email,
        mobile: "+61400000001",
        address: {
          street: "1 E2E Lane",
          suburb: "Testville",
          state: "NSW",
          postcode: "2000",
        },
        relationship: "parent",
      },
      children: [
        {
          firstName: childFirstName,
          surname: childLastName,
          dob: "2018-05-12",
          gender: "female",
        },
      ],
      emergencyContacts: [],
      consents: {
        photography: true,
        sunscreen: true,
        firstAid: true,
        excursions: true,
      },
    } as never,
    select: { id: true },
  });

  // Use raw SQL so we only touch columns that exist in every DB branch —
  // the Prisma schema may be ahead of the target DB (e.g. newer profile
  // fields not yet migrated on Railway).
  const childId = crypto.randomUUID();
  const now = new Date();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Child" ("id", "firstName", "surname", "dob", "status",
       "serviceId", "enrolmentId", "culturalBackground", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10)`,
    childId,
    childFirstName,
    childLastName,
    new Date("2018-05-12"),
    "active",
    service.id,
    enrolment.id,
    "{}",
    now,
    now,
  );
  const child = { id: childId };

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const magicLink = await prisma.parentMagicLink.create({
    data: {
      email,
      tokenHash,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
    select: { id: true },
  });

  return {
    email,
    parentName: `${parentFirstName} ${parentLastName}`,
    serviceId: service.id,
    enrolmentId: enrolment.id,
    childId: child.id,
    magicLinkId: magicLink.id,
    rawToken,
  };
}

export async function saveParentSession(
  seeded: SeededParent,
  storagePath: string,
  baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
): Promise<void> {
  // Belt-and-braces: ensure the target directory exists before writing the
  // storage state. Playwright does NOT create missing parent dirs.
  const fs = await import("fs/promises");
  const path = await import("path");
  await fs.mkdir(path.dirname(storagePath), { recursive: true });

  const ctx = await pwRequest.newContext({ baseURL });
  try {
    const res = await ctx
      .get(`/api/parent/auth/verify?token=${seeded.rawToken}`, {
        maxRedirects: 0,
      })
      .catch(() => null);
    if (res) {
      await res.text().catch(() => "");
    }
    await ctx.storageState({ path: storagePath });
  } finally {
    await ctx.dispose();
  }
}

export async function cleanupParent(seeded: SeededParent): Promise<void> {
  await prisma.parentMagicLink.deleteMany({ where: { id: seeded.magicLinkId } }).catch(() => {});
  await prisma.child.deleteMany({ where: { id: seeded.childId } }).catch(() => {});
  await prisma.enrolmentSubmission.deleteMany({ where: { id: seeded.enrolmentId } }).catch(() => {});
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
