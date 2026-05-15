import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/server-auth";
import { HandbookContentClient } from "./HandbookContentClient";

const SINGLETON_ID = "singleton";

export default async function HandbookPage() {
  const session = await requirePageSession();
  const role = session.user.role ?? null;
  const canEdit = role === "owner" || role === "admin";

  const row = await prisma.amanaHandbookContent.findUnique({
    where: { id: SINGLETON_ID },
  });
  const initialOverrides = ((row?.data ?? {}) as Record<string, string>) || {};

  return (
    <HandbookContentClient
      initialOverrides={initialOverrides}
      canEdit={canEdit}
    />
  );
}
