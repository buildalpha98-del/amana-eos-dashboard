"use client";

import { Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PilotOverview } from "@/components/ambassadors/PilotOverview";
import { DirectorWorklist } from "@/components/ambassadors/DirectorWorklist";
import { MyReferrals } from "@/components/ambassadors/MyReferrals";
import { RefCodesPanel } from "@/components/ambassadors/RefCodesPanel";
import { AdminPanel } from "@/components/ambassadors/AdminPanel";

/**
 * /ambassadors — the Amana Ambassadors pilot (staff enrolment incentives).
 *
 * Tabs by role:
 * - staff (Educator): My referrals only — their credited enrolments, tier,
 *   LMS status and projected payout.
 * - member (Director): Overview, Worklist, Codes & QR.
 * - head_office / admin / owner: everything incl. Admin (pilot config,
 *   payroll export, attendance import).
 */

type Tab = { key: string; label: string };

function tabsForRole(role: string | undefined): Tab[] {
  if (role === "staff") return [{ key: "mine", label: "My referrals" }];
  const base: Tab[] = [
    { key: "overview", label: "Overview" },
    { key: "worklist", label: "Worklist" },
    { key: "codes", label: "Codes & QR" },
  ];
  if (role === "head_office" || role === "admin" || role === "owner") {
    base.push({ key: "admin", label: "Admin" });
  }
  return base;
}

function AmbassadorsContent() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabs = tabsForRole(role);
  const requested = searchParams.get("tab");
  const activeTab = tabs.some((t) => t.key === requested)
    ? (requested as string)
    : tabs[0]?.key;

  const setTab = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", key);
      router.replace(`/ambassadors?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  if (!role) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Amana Ambassadors"
        description="Educator enrolment incentive pilot — every new family an educator brings in counts."
      />

      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                activeTab === t.key
                  ? "border-brand text-brand"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === "mine" && <MyReferrals />}
      {activeTab === "overview" && <PilotOverview />}
      {activeTab === "worklist" && <DirectorWorklist />}
      {activeTab === "codes" && <RefCodesPanel role={role} />}
      {activeTab === "admin" && <AdminPanel role={role} />}
    </div>
  );
}

export default function AmbassadorsPage() {
  return (
    <Suspense>
      <AmbassadorsContent />
    </Suspense>
  );
}
