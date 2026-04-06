import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ReportsDashboard } from "@/components/reports/ReportsDashboard";

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <ReportsDashboard />;
}
