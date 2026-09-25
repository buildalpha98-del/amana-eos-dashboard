import { redirect } from "next/navigation";

/**
 * 2026-07-05 nav consolidation phase 2: folded into /marketing as the
 * Field Ops tab. This stub keeps old links alive.
 *
 * Activation-scoped deep links (ActivationQrLink) append `?activationId=`
 * or `?id=` — QrCodesContent reads those via useSearchParams() once it
 * lands under /marketing, so they must be forwarded through the redirect
 * rather than dropped.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams({ tab: "fieldops", sub: "qr" });
  if (typeof params.activationId === "string") qs.set("activationId", params.activationId);
  if (typeof params.id === "string") qs.set("id", params.id);
  redirect(`/marketing?${qs.toString()}`);
}
