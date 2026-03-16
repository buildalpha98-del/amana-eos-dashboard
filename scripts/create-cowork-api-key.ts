import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Generate a secure random key with amana_ prefix
  const rawKey = "amana_" + randomBytes(32).toString("hex");
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 14); // "amana_" + first 8 hex chars

  // Find the admin/CEO user to associate as creator
  let creator = await prisma.user.findFirst({
    where: { email: "jayden@amanaoshc.com.au" },
  });

  if (!creator) {
    // Fallback: find any owner
    creator = await prisma.user.findFirst({
      where: { role: "owner" },
    });
  }

  if (!creator) {
    // Create the user if they don't exist at all
    console.log("No owner user found. Creating Jayden user...");
    const passwordHash = await bcrypt.hash("ChangeMe123!", 12);
    creator = await prisma.user.create({
      data: {
        name: "Jayden Kowaider",
        email: "jayden@amanaoshc.com.au",
        passwordHash,
        role: "owner",
      },
    });
    console.log("Created user:", creator.id);
  }

  console.log("Creator:", creator.name, `(${creator.email})`);

  // Delete any existing cowork automation keys
  const deleted = await prisma.apiKey.deleteMany({
    where: { name: "Cowork Automation" },
  });
  if (deleted.count > 0) {
    console.log(`Deleted ${deleted.count} existing "Cowork Automation" key(s)`);
  }

  // Create the new API key with ALL scopes
  const apiKey = await prisma.apiKey.create({
    data: {
      name: "Cowork Automation",
      keyPrefix,
      keyHash,
      scopes: [
        "programs:write",
        "programs:read",
        "menus:write",
        "menus:read",
        "announcements:write",
        "announcements:read",
        "email:write",
        "whatsapp:write",
        "social:write",
        "audits:read",
        "audits:write",
        "holiday-quest:write",
        "holiday-quest:read",
        "reports:write",
        "marketing:write",
        "marketing:read",
        "marketing-tasks:write",
        "marketing-tasks:read",
        "marketing-campaigns:write",
        "marketing-campaigns:read",
        "enquiries:write",
        "enquiries:read",
        "recruitment:write",
        "recruitment:read",
        "attendance:read",
        "pipeline:read",
        "hr:read",
        "billing:read",
        "billing:write",
        "financials:read",
        "operations:read",
        "operations:write",
        "parent-experience:read",
        "parent-experience:write",
        "partnerships:read",
        "partnerships:write",
        "staff:sync",
      ],
      allowedIps: [],
      createdById: creator.id,
      // No expiresAt = never expires
      // No revokedAt = not revoked
    },
  });

  console.log("============================================");
  console.log("API KEY CREATED SUCCESSFULLY");
  console.log("============================================");
  console.log("");
  console.log("Key ID:     ", apiKey.id);
  console.log("Key Prefix: ", apiKey.keyPrefix);
  console.log("Key Hash:   ", apiKey.keyHash);
  console.log("Scopes:     ", apiKey.scopes.length, "scopes (all)");
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════════════════╗");
  console.log("║  RAW KEY (save this — shown once only):                                 ║");
  console.log("╠══════════════════════════════════════════════════════════════════════════╣");
  console.log(`║  ${rawKey}`);
  console.log("╚══════════════════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Use this key as: Authorization: Bearer <raw-key>");
  console.log("============================================");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
