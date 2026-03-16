import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { HelpContent } from "./HelpContent";

export default async function HelpPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <HelpContent />;
}
