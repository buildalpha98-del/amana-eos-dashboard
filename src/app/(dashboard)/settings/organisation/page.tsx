import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/server-auth";
import { getOrgSettings } from "@/lib/org-settings";
import { OrganisationSettingsClient } from "./OrganisationSettingsClient";

export default async function OrganisationSettingsPage() {
  const session = await requirePageSession();
  const role = session.user.role;

  // Owner + admin can edit; everyone else gets bounced. Page-level
  // gating still happens through role-permissions, but defending in
  // depth here means a stray nav link can't expose the form.
  if (role !== "owner" && role !== "admin") {
    redirect("/settings");
  }

  const config = await getOrgSettings();

  return <OrganisationSettingsClient initialConfig={config} />;
}
