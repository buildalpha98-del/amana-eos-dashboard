import { requirePageSession } from "@/lib/server-auth";
import { ReportsDashboard } from "@/components/reports/ReportsDashboard";

export default async function ReportsPage() {
  await requirePageSession();
  return <ReportsDashboard />;
}
