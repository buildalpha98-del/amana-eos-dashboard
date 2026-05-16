import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/server-auth";
import { EMAIL_TEMPLATE_MANIFEST } from "@/lib/email-template-manifest";
import { listEmailTemplateOverrides } from "@/lib/email-template-overrides";
import { EmailTemplatesListClient } from "./EmailTemplatesListClient";

export default async function EmailTemplatesPage() {
  const session = await requirePageSession();
  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    redirect("/settings");
  }

  const rows = await listEmailTemplateOverrides(EMAIL_TEMPLATE_MANIFEST);
  return <EmailTemplatesListClient rows={rows} />;
}
