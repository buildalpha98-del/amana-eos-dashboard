/**
 * Verification Seed
 * ================================================================
 * Reusable seed that populates a TEST database with realistic data
 * covering the Services rebuild (4a/4b), Contracts + Recruitment (6),
 * and Report Issue inbox (8a) surfaces.
 *
 * USAGE (against a LOCAL/TEST database only):
 *   DATABASE_URL=postgresql://localhost:5432/amana_test \
 *     npx tsx prisma/seeds/verification-seed.ts
 *
 *   # Wipe tables this seed owns first:
 *   DATABASE_URL=postgresql://localhost:5432/amana_test \
 *     npx tsx prisma/seeds/verification-seed.ts --reset
 *
 * SAFETY
 * ------
 * Hard-refuses to run if DATABASE_URL contains production markers
 * (neon.tech host pattern). There is an escape hatch but it is
 * intentionally undocumented.
 *
 * IDEMPOTENCY
 * -----------
 * Uses upsert on natural keys (service.code, user.email,
 * vacancy role+service, contract user+startDate, etc.). Running
 * twice should not create duplicates. Child records are keyed by
 * deterministic externalId patterns.
 */

import { PrismaClient, Role, ContractType, ContractStatus, EmploymentType, BookingStatus, BookingType, SessionType } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

// ── Safety: production DB guard ────────────────────────────────
function isProductionDb(url: string | undefined): boolean {
  if (!url) return false;
  // Neon production hosts. We assume test databases are on localhost
  // or a clearly-labelled preview host. If you point this at a Neon
  // branch that is NOT the main prod branch, you can pass --force-prod
  // to bypass — but that flag is intentionally not shown in --help.
  const prodMarkers = [
    "neon.tech", // any Neon-hosted DB — be defensive
    "railway.app",
    "prod.amanaoshc",
  ];
  return prodMarkers.some((m) => url.includes(m));
}

function parseFlags(argv: string[]) {
  return {
    reset: argv.includes("--reset"),
    resetAll: argv.includes("--reset-all-dangerous"),
    forceProd: argv.includes("--force-prod"),
  };
}

// ── Seed constants ─────────────────────────────────────────────
const PASSWORD = "TestPass2026!";

const SERVICES = [
  {
    code: "RIV",
    name: "Amana OSHC Riverstone",
    suburb: "Riverstone",
    state: "NSW",
    postcode: "2765",
    email: "riverstone@amanaoshc.com.au",
    phone: "(02) 9000 0001",
    serviceApprovalNumber: "SE-40012345",
    providerApprovalNumber: "PR-50012345",
  },
  {
    code: "MPK",
    name: "Amana OSHC Marsden Park",
    suburb: "Marsden Park",
    state: "NSW",
    postcode: "2765",
    email: "marsden@amanaoshc.com.au",
    phone: "(02) 9000 0002",
    serviceApprovalNumber: "SE-40012346",
    providerApprovalNumber: "PR-50012345",
  },
  {
    code: "SCH",
    name: "Amana OSHC Schofields",
    suburb: "Schofields",
    state: "NSW",
    postcode: "2762",
    email: "schofields@amanaoshc.com.au",
    phone: "(02) 9000 0003",
    serviceApprovalNumber: "SE-40012347",
    providerApprovalNumber: "PR-50012345",
  },
] as const;

const SESSION_TIMES = {
  bsc: { start: "06:30", end: "08:45" },
  asc: { start: "15:00", end: "18:00" },
  vc: { start: "07:00", end: "18:00" },
};

const CASUAL_BOOKING_SETTINGS = {
  bsc: {
    enabled: true,
    fee: 36,
    spots: 10,
    cutOffHours: 24,
    days: ["mon", "tue", "wed", "thu", "fri"],
  },
  asc: {
    enabled: true,
    fee: 45,
    spots: 12,
    cutOffHours: 24,
    days: ["mon", "tue", "wed", "thu", "fri"],
  },
  vc: {
    enabled: false,
    fee: 110,
    spots: 30,
    cutOffHours: 48,
    days: [],
  },
};

// Deterministic child ages across services
const FIRST_NAMES = [
  "Ayaan", "Zaynab", "Omar", "Layla", "Yusuf", "Hana", "Ibrahim", "Maryam",
  "Bilal", "Safiya", "Kareem", "Aisha", "Hamza", "Noor", "Zaid", "Sumayya",
  "Khalid", "Salma", "Idris", "Amira", "Musa", "Fatima", "Adam", "Yasmin",
  "Hassan", "Iman", "Jibril", "Khadija", "Nabil", "Zahra", "Ridwan", "Lina",
  "Faris", "Asiya", "Tariq", "Maha", "Uzair", "Rania", "Saif", "Dina",
];
const SURNAMES = [
  "Khan", "Ahmed", "Rahman", "Al-Sayed", "Hussain", "Farooq", "Malik", "Shah",
  "Hashim", "Siddiqui",
];

const TAGS_POOL: Array<string[]> = [
  [],
  [],
  ["siblings"],
  ["vip-family"],
  ["withdrawal-notice"],
  ["siblings", "vip-family"],
];
const CCS_STATUSES = ["eligible", "eligible", "eligible", "pending", "ineligible"];
const MEDICAL_POOL: Array<string[]> = [
  [],
  ["Asthma"],
  ["Anaphylaxis - Peanuts"],
  ["Eczema"],
  ["Asthma", "Hayfever"],
  ["Anaphylaxis - Egg", "Asthma"],
  [],
];
const DIETARY_POOL: Array<string[]> = [
  ["Halal"],
  ["Halal", "Nut-Free"],
  ["Halal", "Vegetarian"],
  ["Halal"],
  ["Halal", "Dairy-Free"],
];

function pick<T>(arr: readonly T[], idx: number): T {
  return arr[idx % arr.length];
}

// ── Helper: ensure a service is in DB ──────────────────────────
async function upsertService(def: (typeof SERVICES)[number]) {
  return prisma.service.upsert({
    where: { code: def.code },
    update: {
      name: def.name,
      suburb: def.suburb,
      state: def.state,
      postcode: def.postcode,
      email: def.email,
      phone: def.phone,
      serviceApprovalNumber: def.serviceApprovalNumber,
      providerApprovalNumber: def.providerApprovalNumber,
      sessionTimes: SESSION_TIMES,
      casualBookingSettings: CASUAL_BOOKING_SETTINGS,
      status: "active",
      capacity: 80,
      capacityBsc: 25,
      capacityAsc: 50,
      capacityVc: 30,
      bscDailyRate: 36,
      ascDailyRate: 45,
      vcDailyRate: 110,
    },
    create: {
      code: def.code,
      name: def.name,
      suburb: def.suburb,
      state: def.state,
      postcode: def.postcode,
      email: def.email,
      phone: def.phone,
      serviceApprovalNumber: def.serviceApprovalNumber,
      providerApprovalNumber: def.providerApprovalNumber,
      sessionTimes: SESSION_TIMES,
      casualBookingSettings: CASUAL_BOOKING_SETTINGS,
      status: "active",
      capacity: 80,
      capacityBsc: 25,
      capacityAsc: 50,
      capacityVc: 30,
      bscDailyRate: 36,
      ascDailyRate: 45,
      vcDailyRate: 110,
    },
  });
}

// ── Helper: UTC-safe date midnight ─────────────────────────────
function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUtc(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// ── Reset ──────────────────────────────────────────────────────
async function resetSeededTables(resetAll: boolean) {
  console.log("Wiping seed-owned tables...");
  // Order matters (FK). Start with leaf records.
  await prisma.attendanceRecord.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.aiTaskDraft.deleteMany({});
  await prisma.internalFeedback.deleteMany({});
  await prisma.staffReferral.deleteMany({});
  await prisma.recruitmentCandidate.deleteMany({});
  await prisma.recruitmentVacancy.deleteMany({});
  await prisma.staffOnboardingProgress.deleteMany({});
  await prisma.staffOnboarding.deleteMany({});
  await prisma.onboardingTask.deleteMany({});
  await prisma.onboardingPack.deleteMany({});
  await prisma.employmentContract.deleteMany({});

  if (resetAll) {
    console.log("  --reset-all-dangerous: wiping children + services too");
    await prisma.child.deleteMany({});
    // Intentionally NOT wiping User (may collide with real accounts)
    // Services: only delete if they match our seed codes
    await prisma.service.deleteMany({
      where: { code: { in: SERVICES.map((s) => s.code) } },
    });
  } else {
    // Only clear children we own (by ownaChildId pattern we set)
    await prisma.child.deleteMany({
      where: { ownaChildId: { startsWith: "VERIFY-" } },
    });
  }

  console.log("  done");
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const dbUrl = process.env.DATABASE_URL;

  if (isProductionDb(dbUrl) && !flags.forceProd) {
    console.error("=================================================");
    console.error("REFUSING TO SEED PRODUCTION DATABASE");
    console.error("=================================================");
    console.error(`DATABASE_URL looks like a production DB (host contains neon.tech / railway.app / prod.amanaoshc).`);
    console.error("Point DATABASE_URL at a local or test database and retry.");
    console.error("Example:");
    console.error("  DATABASE_URL=postgresql://localhost:5432/amana_test \\");
    console.error("    npx tsx prisma/seeds/verification-seed.ts");
    process.exit(1);
  }

  console.log(`Seeding verification data to: ${dbUrl?.replace(/:[^:@/]+@/, ":****@") ?? "(default)"}`);

  if (flags.reset || flags.resetAll) {
    await resetSeededTables(flags.resetAll);
  }

  const passwordHash = await hash(PASSWORD, 10);

  // ── 3 Services ──────────────────────────────────────────────
  console.log("Seeding services...");
  const services = await Promise.all(SERVICES.map(upsertService));
  const svcByCode = Object.fromEntries(services.map((s) => [s.code, s]));
  console.log(`  ${services.length} services upserted`);

  // ── 15 Staff users across 7 roles ───────────────────────────
  console.log("Seeding staff users...");
  type StaffSpec = { name: string; email: string; role: Role; serviceCode: string | null; state?: string | null };
  const staffSpecs: StaffSpec[] = [
    { name: "Jayden Kowaider", email: "jayden@amanaoshc.com.au", role: "owner", serviceCode: null, state: null },
    { name: "Daniel Head Office", email: "daniel@amanaoshc.com.au", role: "head_office", serviceCode: null, state: null },
    { name: "Tracie Admin", email: "tracie@amanaoshc.com.au", role: "admin", serviceCode: null, state: "NSW" },
    { name: "Mirna Admin", email: "mirna@amanaoshc.com.au", role: "admin", serviceCode: null, state: "NSW" },
    { name: "Akram Marketing", email: "akram@amanaoshc.com.au", role: "marketing", serviceCode: null, state: null },
    { name: "Coord Riverstone", email: "coord.riv@amanaoshc.com.au", role: "member", serviceCode: "RIV", state: "NSW" },
    { name: "Coord Marsden Park", email: "coord.mpk@amanaoshc.com.au", role: "member", serviceCode: "MPK", state: "NSW" },
    { name: "Coord Schofields", email: "coord.sch@amanaoshc.com.au", role: "member", serviceCode: "SCH", state: "NSW" },
    { name: "Member Riverstone", email: "member.riv@amanaoshc.com.au", role: "member", serviceCode: "RIV", state: "NSW" },
    { name: "Member Marsden Park", email: "member.mpk@amanaoshc.com.au", role: "member", serviceCode: "MPK", state: "NSW" },
    { name: "Member Schofields", email: "member.sch@amanaoshc.com.au", role: "member", serviceCode: "SCH", state: "NSW" },
    { name: "Staff Amira", email: "staff.amira@amanaoshc.com.au", role: "staff", serviceCode: "RIV", state: "NSW" },
    { name: "Staff Bilal", email: "staff.bilal@amanaoshc.com.au", role: "staff", serviceCode: "MPK", state: "NSW" },
    { name: "Staff Hana", email: "staff.hana@amanaoshc.com.au", role: "staff", serviceCode: "SCH", state: "NSW" },
    { name: "Staff Omar", email: "staff.omar@amanaoshc.com.au", role: "staff", serviceCode: "RIV", state: "NSW" },
  ];

  const users: Record<string, Awaited<ReturnType<typeof prisma.user.upsert>>> = {};
  for (const spec of staffSpecs) {
    const email = spec.email.toLowerCase().trim();
    const svcId = spec.serviceCode ? svcByCode[spec.serviceCode].id : null;
    const u = await prisma.user.upsert({
      where: { email },
      update: {
        name: spec.name,
        role: spec.role,
        serviceId: svcId,
        state: spec.state ?? null,
        active: true,
      },
      create: {
        name: spec.name,
        email,
        passwordHash,
        role: spec.role,
        serviceId: svcId,
        state: spec.state ?? null,
        active: true,
        employmentType: spec.role === "staff" ? "casual" : "permanent",
        startDate: utcDate(2025, 8, 1),
      },
    });
    users[email] = u;
  }
  console.log(`  ${Object.keys(users).length} staff users upserted`);

  // ── 40 Children ─────────────────────────────────────────────
  console.log("Seeding children...");
  const children: Array<Awaited<ReturnType<typeof prisma.child.upsert>>> = [];
  const today = new Date();
  const todayYear = today.getUTCFullYear();

  for (let i = 0; i < 40; i++) {
    const svc = services[i % 3];
    const firstName = pick(FIRST_NAMES, i);
    const surname = pick(SURNAMES, Math.floor(i / 4));
    const age = 5 + (i % 8); // 5-12
    const dob = utcDate(todayYear - age, 3 + (i % 9), 1 + (i % 27));
    const ownaChildId = `VERIFY-${svc.code}-${String(i).padStart(3, "0")}`;
    const room = `R${1 + (i % 3)}`; // R1/R2/R3
    const tags = pick(TAGS_POOL, i);
    const ccs = pick(CCS_STATUSES, i);
    const medConditions = pick(MEDICAL_POOL, i);
    const dietary = pick(DIETARY_POOL, i);

    // Fortnight pattern example
    const bookingPrefs = {
      type: "permanent",
      fortnightPattern: {
        week1: {
          bsc: i % 4 === 0 ? ["mon", "wed"] : [],
          asc: ["mon", "tue", "wed", "thu", "fri"].slice(0, 3 + (i % 3)),
        },
        week2: {
          bsc: i % 4 === 0 ? ["tue", "thu"] : [],
          asc: ["mon", "tue", "wed", "thu", "fri"].slice(0, 3 + ((i + 1) % 3)),
        },
      },
    };

    // NOTE: using `any` cast for Child data because newer fields
    // (room, ccsStatus, tags, medicareNumber, bookingPrefs, etc.) may not
    // be present in a stale generated Prisma client. Run `prisma generate`
    // before `tsx verification-seed.ts` to regenerate types.
    const childData = {
      firstName,
      surname,
      dob,
      gender: i % 2 === 0 ? "male" : "female",
      serviceId: svc.id,
      schoolName: `${svc.name.replace("Amana OSHC ", "")} Public School`,
      yearLevel: `Year ${age - 4}`,
      crn: `${String(700_000_000 + i * 541).padStart(10, "0")}A`,
      culturalBackground: ["Australian", i % 3 === 0 ? "Lebanese" : i % 3 === 1 ? "Pakistani" : "Egyptian"],
      room,
      tags,
      ccsStatus: ccs,
      medicalConditions: medConditions,
      anaphylaxisActionPlan: medConditions.some((m) => m.toLowerCase().includes("anaphylaxis")),
      dietaryRequirements: dietary,
      medicareNumber: `4${String(100_000_000 + i * 131).padStart(10, "0")}`,
      medicareExpiry: utcDate(todayYear + 3, 12, 31),
      medicareRef: String(1 + (i % 9)),
      vaccinationStatus: i % 5 === 0 ? "overdue" : "up_to_date",
      status: i % 10 === 9 ? "withdrawn" : "active",
      bookingPrefs,
    };
    const child = await prisma.child.upsert({
      where: { ownaChildId },
      update: childData as never,
      create: { ownaChildId, ...childData } as never,
    });
    children.push(child);
  }
  console.log(`  ${children.length} children upserted`);

  // ── 30 days of historical attendance records ────────────────
  console.log("Seeding attendance records (30 days x subset of children)...");
  let attendanceCount = 0;
  // Anchor to yesterday UTC midnight, walk back 30 days.
  const todayUtcMidnight = utcDate(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate());
  for (let dayOffset = 1; dayOffset <= 30; dayOffset++) {
    const date = addDaysUtc(todayUtcMidnight, -dayOffset);
    // Skip weekends for realism
    const dow = date.getUTCDay();
    if (dow === 0 || dow === 6) continue;

    // About 60% of active children attend on any given day
    for (let i = 0; i < children.length; i++) {
      if ((i + dayOffset) % 5 === 0) continue; // ~20% no booking
      const child = children[i];
      if (child.status !== "active") continue;

      const sessionType: SessionType = i % 3 === 0 ? "bsc" : "asc";
      const status = (i + dayOffset) % 7 === 0 ? "absent" : (i + dayOffset) % 7 === 1 ? "booked" : "present";
      const signInTime = status === "present" ? new Date(date.getTime() + (sessionType === "bsc" ? 7 : 15) * 3600_000) : null;
      const signOutTime = status === "present" ? new Date(date.getTime() + (sessionType === "bsc" ? 8 : 17) * 3600_000 + 30 * 60_000) : null;

      try {
        await prisma.attendanceRecord.upsert({
          where: {
            childId_serviceId_date_sessionType: {
              childId: child.id,
              serviceId: child.serviceId!,
              date,
              sessionType,
            },
          },
          update: {
            status,
            signInTime,
            signOutTime,
            absenceReason: status === "absent" ? "parent-notified illness" : null,
          },
          create: {
            childId: child.id,
            serviceId: child.serviceId!,
            date,
            sessionType,
            status,
            signInTime,
            signOutTime,
            absenceReason: status === "absent" ? "parent-notified illness" : null,
          },
        });
        attendanceCount++;
      } catch (e) {
        // Non-fatal; deterministic dedupe will skip true dupes
      }
    }
  }
  console.log(`  ${attendanceCount} attendance records`);

  // ── 50 Bookings: 40 permanent confirmed + 10 casual (past/future/cancelled) ──
  console.log("Seeding bookings...");
  let bookingCount = 0;
  // 40 permanent confirmed bookings on next week
  for (let i = 0; i < 40; i++) {
    const child = children[i];
    if (!child.serviceId) continue;
    const date = addDaysUtc(todayUtcMidnight, 7 + (i % 5));
    const sessionType: SessionType = i % 3 === 0 ? "bsc" : "asc";
    try {
      await prisma.booking.upsert({
        where: {
          childId_serviceId_date_sessionType: {
            childId: child.id,
            serviceId: child.serviceId,
            date,
            sessionType,
          },
        },
        update: {
          status: BookingStatus.confirmed,
          type: BookingType.permanent,
          fee: sessionType === "bsc" ? 36 : 45,
        },
        create: {
          childId: child.id,
          serviceId: child.serviceId,
          date,
          sessionType,
          status: BookingStatus.confirmed,
          type: BookingType.permanent,
          fee: sessionType === "bsc" ? 36 : 45,
          gapFee: sessionType === "bsc" ? 15 : 18,
          ccsApplied: sessionType === "bsc" ? 21 : 27,
        },
      });
      bookingCount++;
    } catch {}
  }

  // 10 casual bookings — mix of past/future/cancelled
  for (let i = 0; i < 10; i++) {
    const child = children[i];
    if (!child.serviceId) continue;
    const offset = i < 4 ? -5 - i : i < 7 ? 3 + i : 10 + i;
    const date = addDaysUtc(todayUtcMidnight, offset);
    const sessionType: SessionType = "asc";
    const status =
      i < 2 ? BookingStatus.cancelled :
      i < 4 ? BookingStatus.confirmed : // past
      i < 7 ? BookingStatus.requested : // future pending
      BookingStatus.confirmed; // future confirmed
    try {
      await prisma.booking.upsert({
        where: {
          childId_serviceId_date_sessionType: {
            childId: child.id,
            serviceId: child.serviceId,
            date,
            sessionType,
          },
        },
        update: { status, type: BookingType.casual, fee: 45 },
        create: {
          childId: child.id,
          serviceId: child.serviceId,
          date,
          sessionType,
          status,
          type: BookingType.casual,
          fee: 45,
          gapFee: 18,
          ccsApplied: 27,
        },
      });
      bookingCount++;
    } catch {}
  }
  console.log(`  ${bookingCount} bookings`);

  // ── 12 Employment contracts (2 per staff, varied chain) ─────
  console.log("Seeding employment contracts...");
  const contractStaff = Object.values(users).filter((u) => u.role !== "owner" && u.role !== "head_office").slice(0, 6);
  let contractCount = 0;
  for (let i = 0; i < contractStaff.length; i++) {
    const staff = contractStaff[i];

    // Casual (superseded)
    const casualStart = utcDate(2024, 8, 1 + i);
    const casual = await prisma.employmentContract.upsert({
      where: { id: `verify-contract-${staff.id}-1` },
      update: {},
      create: {
        id: `verify-contract-${staff.id}-1`,
        userId: staff.id,
        contractType: ContractType.ct_casual,
        awardLevel: "es1",
        payRate: 32.5,
        hoursPerWeek: null,
        startDate: casualStart,
        endDate: utcDate(2025, 7, 31),
        status: ContractStatus.superseded,
        signedAt: casualStart,
        acknowledgedByStaff: true,
        acknowledgedAt: casualStart,
        notes: "Initial casual appointment",
      },
    });
    contractCount++;

    // Upgrade — 3 active, 6 superseded, 3 draft
    const upgradeStatus: ContractStatus =
      i < 3 ? ContractStatus.active : i < 5 ? ContractStatus.superseded : ContractStatus.contract_draft;
    const upgradeType: ContractType = i % 2 === 0 ? ContractType.ct_permanent : ContractType.ct_part_time;
    await prisma.employmentContract.upsert({
      where: { id: `verify-contract-${staff.id}-2` },
      update: { status: upgradeStatus },
      create: {
        id: `verify-contract-${staff.id}-2`,
        userId: staff.id,
        contractType: upgradeType,
        awardLevel: i % 3 === 0 ? "es3" : "es2",
        payRate: upgradeType === ContractType.ct_permanent ? 42.5 : 38.75,
        hoursPerWeek: upgradeType === ContractType.ct_permanent ? 38 : 24,
        startDate: utcDate(2025, 8, 1),
        status: upgradeStatus,
        documentUrl: i === 0 ? "https://example.com/contracts/sample-signed.pdf" : null,
        signedAt: upgradeStatus === ContractStatus.active ? utcDate(2025, 7, 20) : null,
        acknowledgedByStaff: upgradeStatus === ContractStatus.active,
        acknowledgedAt: upgradeStatus === ContractStatus.active ? utcDate(2025, 7, 22) : null,
        previousContractId: casual.id,
        notes: upgradeStatus === ContractStatus.contract_draft ? "Awaiting counter-signature" : null,
      },
    });
    contractCount++;
  }
  console.log(`  ${contractCount} contracts`);

  // ── 4 Recruitment vacancies ─────────────────────────────────
  console.log("Seeding recruitment vacancies...");
  const vacancySpecs: Array<{
    id: string;
    serviceCode: string;
    role: string;
    status: string;
    employmentType: EmploymentType;
  }> = [
    { id: "verify-vac-riv-1", serviceCode: "RIV", role: "educator", status: "open", employmentType: "casual" },
    { id: "verify-vac-mpk-1", serviceCode: "MPK", role: "senior_educator", status: "interviewing", employmentType: "permanent" },
    { id: "verify-vac-sch-1", serviceCode: "SCH", role: "member", status: "filled", employmentType: "permanent" },
    { id: "verify-vac-riv-2", serviceCode: "RIV", role: "educator", status: "open", employmentType: "casual" },
  ];

  const vacancies: Array<Awaited<ReturnType<typeof prisma.recruitmentVacancy.upsert>>> = [];
  for (const v of vacancySpecs) {
    const vac = await prisma.recruitmentVacancy.upsert({
      where: { id: v.id },
      update: { status: v.status },
      create: {
        id: v.id,
        serviceId: svcByCode[v.serviceCode].id,
        role: v.role,
        employmentType: v.employmentType,
        qualificationRequired: v.role === "educator" ? "cert_iii" : "diploma",
        status: v.status,
        postedChannels: ["seek", "indeed", v.role === "educator" ? "community" : "referral"],
        postedAt: utcDate(2026, 3, 1),
        targetFillDate: utcDate(2026, 5, 31),
        filledAt: v.status === "filled" ? utcDate(2026, 4, 15) : null,
      },
    });
    vacancies.push(vac);
  }
  console.log(`  ${vacancies.length} vacancies`);

  // ── 10 Recruitment candidates ───────────────────────────────
  console.log("Seeding recruitment candidates...");
  const candSpecs = [
    { id: "verify-cand-1", vac: 0, name: "Hana Al-Masri", source: "seek", stage: "applied" },
    { id: "verify-cand-2", vac: 0, name: "Yusuf Barakat", source: "indeed", stage: "screened", ai: 82 },
    { id: "verify-cand-3", vac: 0, name: "Maha Zaher", source: "community", stage: "interviewed" },
    { id: "verify-cand-4", vac: 1, name: "Tariq Kareem", source: "seek", stage: "offered", ai: 91 },
    { id: "verify-cand-5", vac: 1, name: "Iman Saeed", source: "referral", stage: "screened" },
    { id: "verify-cand-6", vac: 1, name: "Saif Rafiq", source: "mosque", stage: "applied" },
    { id: "verify-cand-7", vac: 2, name: "Zahra Khalil", source: "seek", stage: "accepted" },
    { id: "verify-cand-8", vac: 2, name: "Nabil Faris", source: "university", stage: "rejected" },
    { id: "verify-cand-9", vac: 3, name: "Dina Habib", source: "walkin", stage: "applied" },
    { id: "verify-cand-10", vac: 3, name: "Ridwan Amiri", source: "referral", stage: "screened" },
  ];

  const candidates: Array<Awaited<ReturnType<typeof prisma.recruitmentCandidate.upsert>>> = [];
  for (const c of candSpecs) {
    const cand = await prisma.recruitmentCandidate.upsert({
      where: { id: c.id },
      update: { stage: c.stage },
      create: {
        id: c.id,
        vacancyId: vacancies[c.vac].id,
        name: c.name,
        email: `${c.name.toLowerCase().replace(/[^a-z]/g, ".")}@example.com`,
        phone: "0400 000 000",
        source: c.source,
        stage: c.stage,
        resumeText: c.ai
          ? `${c.name} has 5 years of OSHC experience, Cert III in Children's Services, current WWCC and First Aid. Worked at two faith-based centres previously. Flexible for split shifts.`
          : undefined,
        aiScreenScore: c.ai,
        aiScreenSummary: c.ai ? `Strong fit (${c.ai}/100): meets qualification, has OSHC experience, culturally aligned.` : null,
      },
    });
    candidates.push(cand);
  }
  console.log(`  ${candidates.length} candidates`);

  // ── 3 Staff referrals ───────────────────────────────────────
  console.log("Seeding staff referrals...");
  const referrerUser = users["coord.riv@amanaoshc.com.au"];
  const referrerUser2 = users["coord.mpk@amanaoshc.com.au"];
  await prisma.staffReferral.upsert({
    where: { candidateId: candidates[4].id },
    update: {},
    create: {
      referrerUserId: referrerUser.id,
      referredName: "Iman Saeed",
      referredEmail: "iman.saeed@example.com",
      candidateId: candidates[4].id,
      status: "pending",
      bonusAmount: 200,
    },
  });
  // Hired referral
  await prisma.staffReferral.upsert({
    where: { candidateId: candidates[6].id },
    update: { status: "hired" },
    create: {
      referrerUserId: referrerUser2.id,
      referredName: "Zahra Khalil",
      referredEmail: "zahra.khalil@example.com",
      candidateId: candidates[6].id,
      status: "hired",
      bonusAmount: 200,
    },
  });
  // Bonus paid referral (no candidate)
  const existingBonus = await prisma.staffReferral.findFirst({
    where: { referrerUserId: users["coord.sch@amanaoshc.com.au"].id, referredName: "Adam Qasim" },
  });
  if (!existingBonus) {
    await prisma.staffReferral.create({
      data: {
        referrerUserId: users["coord.sch@amanaoshc.com.au"].id,
        referredName: "Adam Qasim",
        referredEmail: "adam.qasim@example.com",
        status: "bonus_paid",
        bonusAmount: 200,
        bonusPaidAt: utcDate(2026, 3, 20),
      },
    });
  }
  console.log(`  3 referrals`);

  // ── 5 Internal feedback entries ─────────────────────────────
  console.log("Seeding internal feedback...");
  const feedbackSpecs = [
    { id: "verify-fb-1", authorEmail: "member.riv@amanaoshc.com.au", category: "bug", status: "new", msg: "Roll-call weekly view not scrolling on iPhone SE" },
    { id: "verify-fb-2", authorEmail: "coord.mpk@amanaoshc.com.au", category: "feature_request", status: "acknowledged", msg: "Add bulk-sign-in for late arrivals" },
    { id: "verify-fb-3", authorEmail: "staff.amira@amanaoshc.com.au", category: "question", status: "in_progress", msg: "How do I mark a child as casual for one day?" },
    { id: "verify-fb-4", authorEmail: "akram@amanaoshc.com.au", category: "general", status: "resolved", msg: "Marketing dashboard looks great this week, thanks!" },
    { id: "verify-fb-5", authorEmail: "coord.sch@amanaoshc.com.au", category: "bug", status: "new", msg: "Contract acknowledge button spins forever on Safari" },
  ];
  for (const f of feedbackSpecs) {
    await prisma.internalFeedback.upsert({
      where: { id: f.id },
      update: { status: f.status },
      create: {
        id: f.id,
        authorId: users[f.authorEmail].id,
        category: f.category,
        message: f.msg,
        page: f.category === "bug" ? "/roll-call" : "/services/RIV",
        status: f.status,
        resolvedAt: f.status === "resolved" ? utcDate(2026, 4, 20) : null,
        adminNotes: f.status === "in_progress" ? "Replied to user — awaiting confirmation" : null,
      },
    });
  }
  console.log(`  ${feedbackSpecs.length} feedback entries`);

  // ── 2 AI task drafts (status ready, attached to todos) ──────
  console.log("Seeding AI task drafts...");
  // Ensure at least 2 todos exist
  const owner = users["jayden@amanaoshc.com.au"];
  const admin = users["tracie@amanaoshc.com.au"];
  const todoWeekOf = utcDate(todayUtcMidnight.getUTCFullYear(), todayUtcMidnight.getUTCMonth() + 1, todayUtcMidnight.getUTCDate());
  const todo1 = await prisma.todo.upsert({
    where: { id: "verify-todo-1" },
    update: {},
    create: {
      id: "verify-todo-1",
      title: "Draft parent reminder for end-of-term",
      description: "Email to all RIV parents about last-day logistics",
      assigneeId: admin.id,
      createdById: owner.id,
      serviceId: svcByCode["RIV"].id,
      dueDate: addDaysUtc(todoWeekOf, 5),
      weekOf: todoWeekOf,
      status: "pending",
    },
  });
  const todo2 = await prisma.todo.upsert({
    where: { id: "verify-todo-2" },
    update: {},
    create: {
      id: "verify-todo-2",
      title: "Review vacancy applications (Marsden Park)",
      description: "Shortlist top 3 senior educator candidates",
      assigneeId: users["coord.mpk@amanaoshc.com.au"].id,
      createdById: owner.id,
      serviceId: svcByCode["MPK"].id,
      dueDate: addDaysUtc(todoWeekOf, 3),
      weekOf: todoWeekOf,
      status: "pending",
    },
  });

  await prisma.aiTaskDraft.upsert({
    where: { id: "verify-draft-1" },
    update: {},
    create: {
      id: "verify-draft-1",
      todoId: todo1.id,
      taskType: "communication",
      title: "End-of-term reminder email draft",
      content: `# End of Term — Friday Reminder\n\nDear parents,\n\nA friendly reminder that this Friday is the last day of Term 1. Pickup is 6:00pm sharp.\n\n- Please collect all labelled items\n- Vacation care runs 22–26 April (separate booking required)\n- Week 2 of Fortnight B\n\nWarm regards,\nAmana OSHC Riverstone`,
      status: "ready",
      tokensUsed: 312,
      model: "claude-haiku-3-5-20241022",
    },
  });
  await prisma.aiTaskDraft.upsert({
    where: { id: "verify-draft-2" },
    update: {},
    create: {
      id: "verify-draft-2",
      todoId: todo2.id,
      taskType: "research",
      title: "Candidate shortlist summary",
      content: `## Top 3 candidates for Senior Educator (MPK)\n\n1. **Tariq Kareem** — AI screen 91/100. 5 yrs OSHC experience.\n2. **Iman Saeed** — Referral from Coord RIV. Cert IV.\n3. **Saif Rafiq** — Community hire, flexible shifts.\n\n**Next step**: schedule interviews for Thu–Fri next week.`,
      status: "ready",
      tokensUsed: 278,
      model: "claude-haiku-3-5-20241022",
    },
  });
  console.log(`  2 AI task drafts`);

  // ── Onboarding packs (1 default per service + 1 casual pack) ──
  console.log("Seeding onboarding packs...");
  const defaultTasks = [
    { title: "Sign employment contract", category: "hr", sortOrder: 1 },
    { title: "Upload WWCC", category: "compliance", sortOrder: 2 },
    { title: "Upload First Aid certificate", category: "compliance", sortOrder: 3 },
    { title: "Read Child Safety Policy", category: "policy", sortOrder: 4 },
    { title: "Complete Code of Conduct training", category: "training", sortOrder: 5 },
    { title: "Shadow shift with coordinator", category: "induction", sortOrder: 6 },
    { title: "Tax file number declaration", category: "hr", sortOrder: 7 },
  ];
  const casualTasks = [
    { title: "Sign casual agreement", category: "hr", sortOrder: 1 },
    { title: "Upload WWCC", category: "compliance", sortOrder: 2 },
    { title: "Read Child Safety Policy", category: "policy", sortOrder: 3 },
    { title: "Shadow one shift", category: "induction", sortOrder: 4 },
  ];

  for (const svc of services) {
    const pack = await prisma.onboardingPack.upsert({
      where: { id: `verify-pack-${svc.code}` },
      update: { name: `${svc.code} Default Onboarding` },
      create: {
        id: `verify-pack-${svc.code}`,
        name: `${svc.code} Default Onboarding`,
        description: `Default onboarding for ${svc.name}`,
        serviceId: svc.id,
        isDefault: true,
      },
    });
    // Insert tasks if none exist
    const existingTasks = await prisma.onboardingTask.count({ where: { packId: pack.id } });
    if (existingTasks === 0) {
      for (const t of defaultTasks) {
        await prisma.onboardingTask.create({
          data: {
            packId: pack.id,
            title: t.title,
            category: t.category,
            sortOrder: t.sortOrder,
          },
        });
      }
    }
  }

  const casualPack = await prisma.onboardingPack.upsert({
    where: { id: "verify-pack-casual" },
    update: {},
    create: {
      id: "verify-pack-casual",
      name: "Casual Quick-Start",
      description: "Lightweight onboarding for casual staff",
      isDefault: false,
    },
  });
  const existingCasualTasks = await prisma.onboardingTask.count({ where: { packId: casualPack.id } });
  if (existingCasualTasks === 0) {
    for (const t of casualTasks) {
      await prisma.onboardingTask.create({
        data: {
          packId: casualPack.id,
          title: t.title,
          category: t.category,
          sortOrder: t.sortOrder,
        },
      });
    }
  }
  console.log(`  ${services.length + 1} onboarding packs`);

  // ── Summary ─────────────────────────────────────────────────
  console.log("\n=================================================");
  console.log("Seed complete. Summary:");
  console.log(`  ${services.length} services (RIV, MPK, SCH)`);
  console.log(`  ${Object.keys(users).length} staff users (password: ${PASSWORD})`);
  console.log(`  ${children.length} children`);
  console.log(`  ${attendanceCount} attendance records (30d history)`);
  console.log(`  ${bookingCount} bookings`);
  console.log(`  ${contractCount} employment contracts`);
  console.log(`  ${vacancies.length} recruitment vacancies`);
  console.log(`  ${candidates.length} recruitment candidates`);
  console.log(`  3 staff referrals`);
  console.log(`  ${feedbackSpecs.length} internal feedback entries`);
  console.log(`  2 AI task drafts (attached to todos)`);
  console.log(`  ${services.length + 1} onboarding packs (with task definitions)`);
  console.log("=================================================\n");
  console.log("Log in with any seeded email + password: " + PASSWORD);
}

export default main;

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
