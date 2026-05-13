import { requirePageSession } from "@/lib/server-auth";
import { HelpContent } from "./HelpContent";

export default async function HelpPage() {
  await requirePageSession();
  return <HelpContent />;
}
