/**
 * Full database reset — drops all data and re-seeds.
 *
 * Usage: npx tsx prisma/reset.ts
 *
 * WARNING: This is destructive. All data will be permanently deleted.
 * Only the 5 core staff users + VTO + onboarding will be re-created.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("\n⚠️  FULL DATABASE RESET");
  console.log("━".repeat(50));
  console.log("This will DELETE ALL DATA and re-seed with fresh users.\n");

  // Get all table names from the public schema
  const tables: { tablename: string }[] = await prisma.$queryRaw`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename != '_prisma_migrations'
  `;

  console.log(`Found ${tables.length} tables to truncate...`);

  // Truncate all tables in one statement with CASCADE
  const tableNames = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableNames} CASCADE`);

  console.log("✅ All tables truncated.\n");

  // Now re-seed by importing and running the seed script
  console.log("Re-seeding database...\n");

  // Import seed dynamically
  await import("./seed");
}

main()
  .catch((e) => {
    console.error("❌ Reset failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
