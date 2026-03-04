/**
 * Standalone script to upsert all 11 real Amana OSHC service centres.
 * Safe to run multiple times (idempotent via upsert on unique `code`).
 *
 * Usage:  npx tsx scripts/seed-centres.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const centres = [
  // ── NSW Active Centres ──────────────────────────────────────
  {
    name: "Amana OSHC MFIS Beaumont Hills",
    code: "MFIS-BH",
    address: "20 Mungerie Rd",
    suburb: "Beaumont Hills",
    state: "NSW",
    postcode: "2155",
    phone: "1300 200 262",
    email: "beaumonthills@amanaoshc.com.au",
    status: "active" as const,
    capacity: 60,
    operatingDays: "Mon-Fri",
  },
  {
    name: "Amana OSHC MFIS Greenacre",
    code: "MFIS-GA",
    address: "405 Waterloo Rd",
    suburb: "Greenacre",
    state: "NSW",
    postcode: "2190",
    phone: "1300 200 262",
    email: "greenacre@amanaoshc.com.au",
    status: "active" as const,
    capacity: 50,
    operatingDays: "Mon-Fri",
  },
  {
    name: "Amana OSHC MFIS Hoxton Park",
    code: "MFIS-HP",
    address: "210 Pacific Palms Cct",
    suburb: "Hoxton Park",
    state: "NSW",
    postcode: "2171",
    phone: "1300 200 262",
    email: "hoxtonpark@amanaoshc.com.au",
    status: "active" as const,
    capacity: 55,
    operatingDays: "Mon-Fri",
  },
  {
    name: "Amana OSHC Unity Grammar",
    code: "UG",
    address: "70 Fourth Ave",
    suburb: "Austral",
    state: "NSW",
    postcode: "2179",
    phone: "1300 200 262",
    email: "unitygrammar@amanaoshc.com.au",
    status: "active" as const,
    capacity: 45,
    operatingDays: "Mon-Fri",
  },
  {
    name: "Amana OSHC Arkana College",
    code: "ARK",
    address: "346 Stoney Creek Rd",
    suburb: "Kingsgrove",
    state: "NSW",
    postcode: "2208",
    phone: "1300 200 262",
    email: "arkana@amanaoshc.com.au",
    status: "active" as const,
    capacity: 40,
    operatingDays: "Mon-Fri",
  },
  {
    name: "Amana OSHC Minarah College",
    code: "MNC",
    address: "264 Wilson Rd",
    suburb: "Green Valley",
    state: "NSW",
    postcode: "2168",
    phone: "1300 200 262",
    email: "minarah@amanaoshc.com.au",
    status: "active" as const,
    capacity: 50,
    operatingDays: "Mon-Fri",
  },
  // ── VIC Active Centres ──────────────────────────────────────
  {
    name: "Amana OSHC Al-Taqwa College",
    code: "ATC",
    address: "201 Sayers Rd",
    suburb: "Truganina",
    state: "VIC",
    postcode: "3029",
    phone: "1300 200 262",
    email: "altaqwa@amanaoshc.com.au",
    status: "active" as const,
    capacity: 60,
    operatingDays: "Mon-Fri",
  },
  {
    name: "Amana OSHC AIA Coburg",
    code: "AIA-COB",
    address: "653 Sydney Rd",
    suburb: "Coburg",
    state: "VIC",
    postcode: "3058",
    phone: "1300 200 262",
    email: "aiacoburg@amanaoshc.com.au",
    status: "active" as const,
    capacity: 50,
    operatingDays: "Mon-Fri",
  },
  {
    name: "Amana OSHC Minaret Doveton",
    code: "MIN-DOV",
    address: "146 Kidds Rd",
    suburb: "Doveton",
    state: "VIC",
    postcode: "3177",
    phone: "1300 200 262",
    email: "minaretdoveton@amanaoshc.com.au",
    status: "active" as const,
    capacity: 40,
    operatingDays: "Mon-Fri",
  },
  {
    name: "Amana OSHC Minaret Officer",
    code: "MIN-OFF",
    address: "67 Tivendale Rd",
    suburb: "Officer",
    state: "VIC",
    postcode: "3809",
    phone: "1300 200 262",
    email: "minaretofficer@amanaoshc.com.au",
    status: "active" as const,
    capacity: 45,
    operatingDays: "Mon-Fri",
  },
  {
    name: "Amana OSHC Minaret Springvale",
    code: "MIN-SPR",
    address: "36-38 Lewis St",
    suburb: "Springvale",
    state: "VIC",
    postcode: "3171",
    phone: "1300 200 262",
    email: "minaretspringvale@amanaoshc.com.au",
    status: "active" as const,
    capacity: 45,
    operatingDays: "Mon-Fri",
  },
];

async function main() {
  console.log("Seeding 11 real Amana OSHC centres...\n");

  let created = 0;
  let updated = 0;

  for (const centre of centres) {
    const result = await prisma.service.upsert({
      where: { code: centre.code },
      update: {
        name: centre.name,
        address: centre.address,
        suburb: centre.suburb,
        state: centre.state,
        postcode: centre.postcode,
        phone: centre.phone,
        email: centre.email,
        status: centre.status,
        capacity: centre.capacity,
        operatingDays: centre.operatingDays,
      },
      create: centre,
    });

    // Check if it was an update (has updatedAt different from createdAt) or create
    const isNew =
      result.createdAt.getTime() === result.updatedAt.getTime() ||
      Math.abs(result.createdAt.getTime() - result.updatedAt.getTime()) < 1000;

    if (isNew) {
      created++;
      console.log(`  ✅ Created: ${centre.name} (${centre.code})`);
    } else {
      updated++;
      console.log(`  🔄 Updated: ${centre.name} (${centre.code})`);
    }
  }

  // Clean up old/test centres that are no longer in the real list
  const realCodes = centres.map((c) => c.code);
  const obsolete = await prisma.service.findMany({
    where: { code: { notIn: realCodes } },
    select: { id: true, name: true, code: true },
  });

  if (obsolete.length > 0) {
    console.log(`\n  ⚠️  Found ${obsolete.length} centres not in the real list:`);
    for (const s of obsolete) {
      console.log(`     - ${s.name} (${s.code})`);
    }
    console.log("     These were NOT deleted — remove manually if needed.");
  }

  console.log(
    `\nDone! ${created} created, ${updated} updated, ${centres.length} total real centres.`
  );
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
