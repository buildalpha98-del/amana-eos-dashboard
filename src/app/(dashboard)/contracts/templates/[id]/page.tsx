import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasMinRole } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { TemplateEditor } from "@/components/contracts/templates/TemplateEditor";

export default async function ContractTemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const role = (session?.user?.role as Role) || undefined;
  if (!hasMinRole(role, "admin")) redirect("/contracts");
  return <TemplateEditor templateId={id} />;
}
