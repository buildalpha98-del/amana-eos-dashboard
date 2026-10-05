/**
 * Session → KnowledgeScope. The ONLY way scope enters a knowledge query.
 *
 * serviceIds: getCentreScope() — null for owner/admin/EOS (unscoped),
 *   head_office = their state's centres + memberships, member/staff =
 *   primary + manager-of + memberships. NOT serviceScopeFilter(), which is
 *   deliberately primary-only.
 * state: head_office → User.state; member/staff → primary Service.state;
 *   owner/admin → null (no state filter). Canonicalised so SQL equality works.
 */
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getCentreScope } from "@/lib/centre-scope";
import { canonicalState } from "./normalize";
import type { KnowledgeScope } from "./types";

const NO_STATE_ROLES = new Set(["owner", "admin", "eos", "eos_viewer", "eos_implementer"]);

export async function buildKnowledgeScope(session: Session): Promise<KnowledgeScope> {
  const role = session.user.role;
  const userId = session.user.id;
  const { serviceIds } = await getCentreScope(session);

  let state: string | null = null;
  if (!NO_STATE_ROLES.has(role)) {
    if (role === "head_office") {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { state: true } });
      state = canonicalState(u?.state);
    } else {
      const primary = session.user.serviceId ?? null; // typed on Session["user"] in src/types/index.ts
      if (primary) {
        const s = await prisma.service.findUnique({ where: { id: primary }, select: { state: true } });
        state = canonicalState(s?.state);
      }
    }
  }
  return { role, serviceIds, state };
}
