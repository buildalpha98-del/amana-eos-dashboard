import { notFound, redirect } from "next/navigation";
import { requirePageSession } from "@/lib/server-auth";
import {
  EMAIL_TEMPLATE_MANIFEST,
  type EmailTemplateManifestEntry,
} from "@/lib/email-template-manifest";
import { listEmailTemplateOverrides } from "@/lib/email-template-overrides";
import { BulkEditorClient } from "./BulkEditorClient";

type PageProps = { params: Promise<{ category: string }> };

export default async function BulkEditorPage({ params }: PageProps) {
  const session = await requirePageSession();
  const role = session.user.role;
  if (role !== "owner" && role !== "admin") {
    redirect("/settings");
  }

  const { category: rawCategory } = await params;
  const category = decodeURIComponent(rawCategory);

  // Filter manifest to this category. Category names match the manifest's
  // `category` union literal (Auth / Waitlist / Notifications / Parent /
  // Nurture).
  const entriesForCategory: EmailTemplateManifestEntry[] =
    EMAIL_TEMPLATE_MANIFEST.filter((e) => e.category === category);
  if (entriesForCategory.length === 0) notFound();

  const rows = await listEmailTemplateOverrides(entriesForCategory);

  return <BulkEditorClient category={category} rows={rows} />;
}
