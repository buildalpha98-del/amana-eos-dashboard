import { PageHeader } from "@/components/layout/PageHeader";
import { OrgChartView } from "@/components/team/OrgChartView";

/**
 * /accountability-chart — dedicated home for the EOS accountability
 * chart, re-homed out of the legacy /team page as part of the Teams
 * tab redesign (spec PR #77, PR 6).
 *
 * Visible to all roles: it's the canonical "who reports to whom"
 * surface for the org. Edit access stays gated inside OrgChartView
 * itself (owner + admin only).
 */
export default function AccountabilityChartPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <PageHeader
        title="Accountability chart"
        description="The org structure — who is accountable for what. Owners and admins can edit; everyone can view."
      />
      <OrgChartView />
    </div>
  );
}
