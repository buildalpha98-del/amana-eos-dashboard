import { requirePageSession } from "@/lib/server-auth";
import { DirectoryContent } from "./DirectoryContent";

export default async function DirectoryPage() {
  await requirePageSession();
  return <DirectoryContent />;
}
