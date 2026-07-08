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
  // ── Production guard ─────────────────────────────────────────
  // This script TRUNCATEs every table. It must NEVER run against a
  // production/pooled database. Mirrors src/lib/test-utils/cleanup.ts.
  // On 2026-07-07 an unguarded reset wiped the live Neon DB — hence this.
  const dbUrl = process.env.DATABASE_URL ?? "";
  const looksProd =
    dbUrl.includes("neon.tech") ||
    dbUrl.includes("production") ||
    (!dbUrl.includes("localhost") && !dbUrl.includes("127.0.0.1") && !dbUrl.includes("test"));
  if (looksProd && process.env.ALLOW_DESTRUCTIVE_RESET !== "yes-wipe-this-db") {
    console.error(
      "\n⛔ Refusing to run: DATABASE_URL does not look like a local/test database.\n" +
        `   Host: ${dbUrl.replace(/:\/\/[^@]*@/, "://***@").split("?")[0]}\n` +
        "   If you REALLY mean to wipe this database, set ALLOW_DESTRUCTIVE_RESET=yes-wipe-this-db\n",
    );
    process.exit(1);
  }

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
