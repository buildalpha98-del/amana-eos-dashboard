import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/server-auth";
import { ReadConfirmBar } from "@/components/handbook/ReadConfirmBar";
import { AmanaWayContentClient } from "./AmanaWayContentClient";

export const metadata = { title: "The Amana Way" };

const SINGLETON_ID = "singleton";

/**
 * Standalone again (2026-10-07): it's an Educator's own menu item, so it
 * gets its own page instead of redirecting into the six-tab /handbook hub
 * (which office roles still use — same content component, same row).
 */
export default async function TheAmanaWayPage() {
  const session = await requirePageSession();
  const role = session.user.role ?? null;
  const canEdit = role === "owner" || role === "admin";

  const [row, me] = await Promise.all([
    prisma.amanaWayContent.findUnique({ where: { id: SINGLETON_ID } }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { amanaWayReadAt: true } }),
  ]);

  return (
    <>
    <ReadConfirmBar doc="amana-way" label="The Amana Way" alreadyRead={!!me?.amanaWayReadAt} />
    <AmanaWayContentClient
      initialOverrides={((row?.data ?? {}) as Record<string, string>) || {}}
      canEdit={canEdit}
    />
    </>
  );
}
