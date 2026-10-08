"use client";

/**
 * My Training & Compliance (2026-10-08, Daniel): the courses you take and
 * the certificates you keep current are one job — "am I ready to work?" —
 * so they share a page. Compliance here is YOUR documents (WWCC, first
 * aid…), shown for staff and Directors; the network-wide compliance
 * register stays at /compliance for the office.
 */
import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { PageHeader } from "@/components/layout/PageHeader";
import { HubTabs, useHubTab } from "@/components/my-hub/HubTabs";
import { MyTrainingContent } from "./MyTrainingContent";
import CompliancePage from "../compliance/page";

const TABS = [
  { key: "training", label: "Training" },
  { key: "compliance", label: "Compliance documents" },
] as const;

function TrainingHub() {
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  // Only roles whose /compliance view is their OWN documents get the tab.
  const withCompliance = role === "staff" || role === "member";
  const tab = useHubTab(TABS);
  const showCompliance = withCompliance && tab === "compliance";

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {withCompliance && <HubTabs tabs={TABS} active={tab} label="Training and compliance" />}
      {showCompliance ? (
        <CompliancePage />
      ) : (
        <>
          <PageHeader
            title="My Training"
            description="Your induction and ongoing training. Complete each course to stay ready for work."
          />
          <div className="mt-6">
            <MyTrainingContent />
          </div>
        </>
      )}
    </div>
  );
}

export default function MyTrainingPage() {
  return (
    <Suspense fallback={null}>
      <TrainingHub />
    </Suspense>
  );
}
