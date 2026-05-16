import { redirect, notFound } from "next/navigation";
import { requirePageSession } from "@/lib/server-auth";
import { getEmailTemplateManifestEntry } from "@/lib/email-template-manifest";
import { getEmailTemplateOverride } from "@/lib/email-template-overrides";
import { EmailTemplateEditorClient } from "./EmailTemplateEditorClient";

type PageProps = { params: Promise<{ key: string }> };

export default async function EmailTemplateEditorPage({ params }: PageProps) {
  const session = await requirePageSession();
  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    redirect("/settings");
  }

  const { key } = await params;
  const manifest = getEmailTemplateManifestEntry(decodeURIComponent(key));
  if (!manifest) notFound();

  const override = await getEmailTemplateOverride(manifest.key);
  return (
    <EmailTemplateEditorClient
      manifest={manifest}
      initialOverride={override}
    />
  );
}
