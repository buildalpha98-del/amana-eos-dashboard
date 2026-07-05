import { redirect } from "next/navigation";

/**
 * Retired 2026-07-05 (nav consolidation phase 1) — content lives in the
 * Handbook & Help hub. Stub keeps old deep links working, including the
 * admin role-switcher's shared `?role=` links.
 */
export default async function GuidesRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams({ tab: "guides" });
  if (typeof params.role === "string") qs.set("role", params.role);
  redirect(`/handbook?${qs.toString()}`);
}
