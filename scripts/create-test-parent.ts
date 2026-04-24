/**
 * One-shot script: provisions (or refreshes) a dedicated test parent for
 * logging into the Parent Portal v2 demo.
 *
 *   npx tsx scripts/create-test-parent.ts
 *
 * - Ensures an EnrolmentSubmission exists with primary email test-parent@amanaoshc.local
 * - Ensures a matching Child (status=active) is linked
 * - Upserts a CentreContact for the parent + service (mirrors what confirming
 *   an enrolment does in prod)
 * - Issues a ParentMagicLink with 7-day TTL
 * - Prints the one-click login URL
 */

import { Prisma, PrismaClient } from "@prisma/client";
import * as crypto from "crypto";

const prisma = new PrismaClient();

const TEST_EMAIL = "test-parent@amanaoshc.local";
const TEST_FIRST = "Test";
const TEST_LAST = "Parent";
const CHILD_FIRST = "Demo";
const CHILD_LAST = "Child";
const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function main() {
  // Pick any active service — we need one to anchor the enrolment + contact
  const service = await prisma.service.findFirst({
    where: { status: "active" },
    select: { id: true, name: true },
  });
  if (!service) {
    throw new Error(
      "No active service found. Create a service first before running this script.",
    );
  }
  console.log(`[test-parent] using service: ${service.name} (${service.id})`);

  // Upsert the enrolment submission (one per test parent)
  let enrolment = await prisma.enrolmentSubmission.findFirst({
    where: {
      primaryParent: { path: ["email"], equals: TEST_EMAIL },
      status: { not: "draft" },
    },
  });

  if (!enrolment) {
    enrolment = await prisma.enrolmentSubmission.create({
      data: {
        serviceId: service.id,
        status: "processed",
        processedAt: new Date(),
        primaryParent: {
          firstName: TEST_FIRST,
          surname: TEST_LAST,
          email: TEST_EMAIL,
          mobile: "0400000000",
          dob: "1990-01-15",
          crn: "555TEST001A",
          relationship: "Guardian",
          occupation: "Software Engineer",
          workplace: "Test Workplace",
          workPhone: "",
          address: {
            street: "1 Demo Lane",
            suburb: "Fitzroy North",
            state: "VIC",
            postcode: "3068",
          },
        },
        secondaryParent: Prisma.DbNull,
        children: [
          {
            firstName: CHILD_FIRST,
            surname: CHILD_LAST,
            dob: "2018-05-20",
            gender: "other",
            yearLevel: "Year 2",
            schoolName: "Demo Primary",
            crn: "555TEST010B",
            medical: {
              conditions: ["Asthma"],
              allergies: ["Peanuts"],
            },
            bookingPrefs: null,
          },
        ],
        emergencyContacts: [],
        consents: {
          firstAid: true,
          medication: true,
          ambulance: true,
          transport: true,
          excursions: true,
          photos: true,
          sunscreen: true,
        },
        termsAccepted: true,
        privacyAccepted: true,
        debitAgreement: false,
      },
    });
    console.log(`[test-parent] created enrolment ${enrolment.id}`);
  } else {
    console.log(`[test-parent] reusing enrolment ${enrolment.id}`);
  }

  // Ensure there's a linked Child record
  const existingChild = await prisma.child.findFirst({
    where: {
      enrolmentId: enrolment.id,
      firstName: CHILD_FIRST,
      surname: CHILD_LAST,
    },
  });
  if (!existingChild) {
    await prisma.child.create({
      data: {
        enrolmentId: enrolment.id,
        serviceId: service.id,
        firstName: CHILD_FIRST,
        surname: CHILD_LAST,
        dob: new Date("2018-05-20"),
        yearLevel: "Year 2",
        schoolName: "Demo Primary",
        crn: "555TEST010B",
        medicalConditions: ["Asthma"],
        dietaryRequirements: [],
        status: "active",
        medical: { conditions: ["Asthma"], allergies: ["Peanuts"] },
      },
    });
    console.log(`[test-parent] created Child record`);
  } else {
    console.log(`[test-parent] reusing Child record`);
  }

  // Upsert the CentreContact (this is the identity the parent portal resolves
  // to via resolveParentContactForService)
  const existingContact = await prisma.centreContact.findFirst({
    where: { email: TEST_EMAIL, serviceId: service.id },
  });
  if (existingContact) {
    await prisma.centreContact.update({
      where: { id: existingContact.id },
      data: {
        firstName: TEST_FIRST,
        lastName: TEST_LAST,
        mobile: "0400000000",
        dob: new Date("1990-01-15"),
        crn: "555TEST001A",
        relationship: "Guardian",
        occupation: "Software Engineer",
        workplace: "Test Workplace",
        address: {
          street: "1 Demo Lane",
          suburb: "Fitzroy North",
          state: "VIC",
          postcode: "3068",
        },
        parentRole: "primary",
        sourceEnrolmentId: enrolment.id,
      },
    });
    console.log(`[test-parent] refreshed CentreContact ${existingContact.id}`);
  } else {
    const created = await prisma.centreContact.create({
      data: {
        email: TEST_EMAIL,
        firstName: TEST_FIRST,
        lastName: TEST_LAST,
        serviceId: service.id,
        mobile: "0400000000",
        dob: new Date("1990-01-15"),
        crn: "555TEST001A",
        relationship: "Guardian",
        occupation: "Software Engineer",
        workplace: "Test Workplace",
        address: {
          street: "1 Demo Lane",
          suburb: "Fitzroy North",
          state: "VIC",
          postcode: "3068",
        },
        parentRole: "primary",
        sourceEnrolmentId: enrolment.id,
      },
    });
    console.log(`[test-parent] created CentreContact ${created.id}`);
  }

  // Issue a fresh ParentMagicLink (7-day TTL)
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + TTL_MS);

  await prisma.parentMagicLink.create({
    data: {
      email: TEST_EMAIL,
      tokenHash,
      expiresAt,
    },
  });

  const loginUrl = `${BASE_URL}/api/parent/auth/verify?token=${token}`;

  console.log("");
  console.log("════════════════════════════════════════════════════════════");
  console.log("  TEST PARENT READY");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  Email:   ${TEST_EMAIL}`);
  console.log(`  Service: ${service.name}`);
  console.log(`  Child:   ${CHILD_FIRST} ${CHILD_LAST}`);
  console.log(`  Expires: ${expiresAt.toISOString()}`);
  console.log("");
  console.log("  One-click login URL (7-day TTL):");
  console.log(`  ${loginUrl}`);
  console.log("");
  console.log(`  Home (after login): ${BASE_URL}/parent?v2=1`);
  console.log("════════════════════════════════════════════════════════════");
}

main()
  .catch((err) => {
    console.error("[test-parent] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
