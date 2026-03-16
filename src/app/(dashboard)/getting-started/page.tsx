import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { GettingStartedContent } from "./GettingStartedContent";

export default async function GettingStartedPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <GettingStartedContent />;
}
