import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getLandingPage } from "@/lib/role-permissions";

export default async function Home() {
  // Route by role: EOS-only roles land on /rocks, everyone else on
  // /dashboard. Unauthenticated visitors get /dashboard → middleware
  // bounces them to /login as before.
  const session = await getServerSession(authOptions);
  redirect(getLandingPage(session?.user?.role));
}
