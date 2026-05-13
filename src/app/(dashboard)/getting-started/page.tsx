import { requirePageSession } from "@/lib/server-auth";
import { GettingStartedContent } from "./GettingStartedContent";

export default async function GettingStartedPage() {
  await requirePageSession();
  return <GettingStartedContent />;
}
