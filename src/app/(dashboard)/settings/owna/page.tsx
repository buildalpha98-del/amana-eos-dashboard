import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/server-auth";
import { OwnaSettingsClient } from "./OwnaSettingsClient";

/**
 * /settings/owna — link each Amana centre to its OWNA centre (Daniel,
 * 21 Oct 2026). Until a centre is linked the 30-minute OWNA sync skips it:
 * no children, attendance, enquiries or incidents come through.
 */
export default async function OwnaSettingsPage() {
  const session = await requirePageSession();
  const role = session.user.role;
  if (role !== "owner" && role !== "admin") redirect("/settings");
  return <OwnaSettingsClient />;
}
