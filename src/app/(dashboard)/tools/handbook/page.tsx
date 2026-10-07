import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/server-auth";
import { ReadConfirmBar } from "@/components/handbook/ReadConfirmBar";
import { HandbookContentClient } from "./HandbookContentClient";

export const metadata = { title: "Staff Handbook" };

const SINGLETON_ID = "singleton";

/**
 * Standalone again (2026-10-07): the Staff Handbook is an Educator's own
 * menu item. Daniel couldn't find it inside the six-tab /handbook hub,
 * which office roles still use — same content component, same row.
 */
export default async function StaffHandbookPage() {
  const session = await requirePageSession();
  const role = session.user.role ?? null;
  const canEdit = role === "owner" || role === "admin";

  const [row, me] = await Promise.all([
    prisma.amanaHandbookContent.findUnique({ where: { id: SINGLETON_ID } }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { handbookReadAt: true } }),
  ]);

  return (
    <>
    <ReadConfirmBar doc="handbook" label="the Staff Handbook" alreadyRead={!!me?.handbookReadAt} />
    <HandbookContentClient
      initialOverrides={((row?.data ?? {}) as Record<string, string>) || {}}
      canEdit={canEdit}
    />
    </>
  );
}
