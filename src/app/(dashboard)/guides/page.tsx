import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { GuidesContent } from "./GuidesContent";

export default async function GuidesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <GuidesContent />;
}
