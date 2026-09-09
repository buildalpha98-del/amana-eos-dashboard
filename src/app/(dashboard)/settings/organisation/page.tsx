import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/server-auth";
import { getOrgSettings } from "@/lib/org-settings";
import { OrganisationSettingsClient } from "./OrganisationSettingsClient";

export default async function OrganisationSettingsPage() {
  const session = await requirePageSession();
  const role = session.user.role;

  // Owner + admin + head_office can edit (State Managers added
  // 2026-09-05 per Jayden — they own the cert-requirements matrix that
  // lives here). Everyone else gets bounced. Page-level gating still
  // happens through role-permissions, but defending in depth here means
  // a stray nav link can't expose the form.
  if (role !== "owner" && role !== "admin" && role !== "head_office") {
    redirect("/settings");
  }

  const config = await getOrgSettings();

  return <OrganisationSettingsClient initialConfig={config} />;
}
