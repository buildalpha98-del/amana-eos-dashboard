import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/server-auth";
import { isAdminRole } from "@/lib/role-permissions";
import { HqClient } from "./HqClient";

export const dynamic = "force-dynamic";

/**
 * /hq — Amana HQ (Daniel, 21 Oct 2026): the master accounts tracker and
 * everything else head office watches, in one place. Cowork keeps it
 * current; nobody types into a spreadsheet any more.
 */
export default async function HqPage() {
  const session = await requirePageSession();
  if (!isAdminRole(session.user.role)) redirect("/dashboard");
  return (
    <Suspense fallback={null}>
      <HqClient />
    </Suspense>
  );
}
