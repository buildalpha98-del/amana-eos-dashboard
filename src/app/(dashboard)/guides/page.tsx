import { requirePageSession } from "@/lib/server-auth";
import { GuidesContent } from "./GuidesContent";

export default async function GuidesPage() {
  await requirePageSession();
  return <GuidesContent />;
}
