/**
 * Set a user's role by email.
 *
 * Built for promoting the EOS implementer (Cameron) to `eos_implementer`,
 * but works for any user + any role. Prefer the Settings → Team role
 * dropdown for one-offs; this is the CLI path for scripted rollouts.
 *
 * Idempotent: re-running with the same role only bumps tokenVersion, which
 * invalidates any stale session so the user re-logs with the new role
 * (and active sessions pick it up within ~5 min via the JWT re-check).
 *
 * For EOS roles it also clears serviceId/state — those roles are
 * organisation-wide, never centre- or state-scoped.
 *
 * Usage:
 *   npx tsx scripts/set-user-role.ts <email> <role> [--dry]
 *   npx tsx scripts/set-user-role.ts cameron@example.com eos_implementer
 *   npx tsx scripts/set-user-role.ts cameron@example.com eos_implementer --dry
 *
 * Valid roles: owner head_office admin marketing member staff eos_viewer eos_implementer
 */
import { PrismaClient, type Role } from "@prisma/client";
import { ROLES, isEosRole } from "../src/lib/role-enum";

const prisma = new PrismaClient();

async function main() {
  const [emailArg, roleArg, ...rest] = process.argv.slice(2);
  const dry = rest.includes("--dry");

  if (!emailArg || !roleArg) {
    console.error("Usage: npx tsx scripts/set-user-role.ts <email> <role> [--dry]");
    console.error(`Valid roles: ${ROLES.join(" ")}`);
    process.exit(1);
  }

  const email = emailArg.toLowerCase().trim();
  if (!(ROLES as readonly string[]).includes(roleArg)) {
    console.error(`Invalid role "${roleArg}". Valid roles: ${ROLES.join(" ")}`);
    process.exit(1);
  }
  const role = roleArg as Role;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No active user found with email ${email}`);
    process.exit(1);
  }

  console.log(`User: ${user.name} <${user.email}>`);
  console.log(`Role: ${user.role} → ${role}${isEosRole(role) ? " (clears serviceId/state — org-wide)" : ""}`);

  if (dry) {
    console.log("--dry: no changes written.");
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      role,
      // EOS roles are organisation-wide — strip any stray centre/state scoping.
      ...(isEosRole(role) ? { serviceId: null, state: null } : {}),
      // Invalidate the existing (possibly broken) session so the new role
      // takes effect on next request rather than waiting for a fresh login.
      tokenVersion: { increment: 1 },
    },
  });

  console.log(`✓ ${email} is now ${role}. Session invalidated — they re-log (or refresh within ~5 min).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
