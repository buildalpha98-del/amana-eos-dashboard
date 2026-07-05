import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/server-auth";
import { HandbookHubTabs } from "./HandbookHubTabs";

export const metadata = {
  title: "Handbook & Help | Amana EOS",
};

const SINGLETON_ID = "singleton";

/**
 * /handbook — consolidated Handbook & Help hub (nav consolidation phase 1).
 *
 * One page, six tabs (URL-synced via ?tab=): the Educators Handbook, the
 * Employee Handbook, The Amana Way, the Proven Process one-pager, the
 * role-specific Quick-Start Guides, and the Help Centre FAQ. Replaces six
 * separate sidebar entries; the old routes redirect here.
 *
 * Server component so the two singleton content rows (handbook + Amana Way
 * editable overrides) load with the page — the client tab shell receives
 * them as props, matching how the old standalone pages loaded their data.
 */
export default async function HandbookHubPage() {
  const session = await requirePageSession();
  const role = session.user.role ?? null;
  const canEdit = role === "owner" || role === "admin";

  const [handbookRow, amanaWayRow] = await Promise.all([
    prisma.amanaHandbookContent.findUnique({ where: { id: SINGLETON_ID } }),
    prisma.amanaWayContent.findUnique({ where: { id: SINGLETON_ID } }),
  ]);

  return (
    <HandbookHubTabs
      handbookOverrides={((handbookRow?.data ?? {}) as Record<string, string>) || {}}
      amanaWayOverrides={((amanaWayRow?.data ?? {}) as Record<string, string>) || {}}
      canEdit={canEdit}
    />
  );
}
