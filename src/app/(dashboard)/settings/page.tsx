import { requirePageSession } from "@/lib/server-auth";
import { SettingsContent } from "./SettingsContent";

export default async function SettingsPage() {
  const session = await requirePageSession();
  return <SettingsContent userRole={session.user.role} />;
}
