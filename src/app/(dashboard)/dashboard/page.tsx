import { requirePageSession } from "@/lib/server-auth";
import { DashboardContent } from "./DashboardContent";

export default async function DashboardPage() {
  await requirePageSession();
  return <DashboardContent />;
}
