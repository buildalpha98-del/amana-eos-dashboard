import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/server-auth";
import { AmanaWayContentClient } from "./AmanaWayContentClient";

const SINGLETON_ID = "singleton";

export default async function TheAmanaWayPage() {
  const session = await requirePageSession();
  const role = session.user.role ?? null;
  const canEdit = role === "owner" || role === "admin";

  const row = await prisma.amanaWayContent.findUnique({
    where: { id: SINGLETON_ID },
  });
  const initialOverrides = ((row?.data ?? {}) as Record<string, string>) || {};

  return (
    <AmanaWayContentClient
      initialOverrides={initialOverrides}
      canEdit={canEdit}
    />
  );
}
