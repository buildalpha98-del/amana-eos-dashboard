"use client";

/** My Pay & Leave — payslips, leave and expense claims on one page. */
import { HubTabs, useHubTab } from "./HubTabs";
import { MyPayContent } from "@/components/my-pay/MyPayContent";
import { MyLeaveContent } from "@/components/my-leave/MyLeaveContent";
import { MyExpensesContent } from "@/components/my-expenses/MyExpensesContent";

const TABS = [
  { key: "pay", label: "Pay" },
  { key: "leave", label: "Leave" },
  { key: "expenses", label: "Expenses" },
] as const;

export function PayLeaveHub() {
  const tab = useHubTab(TABS);
  return (
    <div>
      <HubTabs tabs={TABS} active={tab} label="Pay and leave" />
      {tab === "pay" && <MyPayContent />}
      {tab === "leave" && <MyLeaveContent />}
      {tab === "expenses" && <MyExpensesContent />}
    </div>
  );
}
