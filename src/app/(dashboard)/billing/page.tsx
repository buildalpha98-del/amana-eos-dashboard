import { Suspense } from "react";
import { BillingDashboard } from "@/components/billing/BillingDashboard";

/**
 * 2026-09-25: `BillingDashboard` reads `?statementId=` so a debtor row on
 * /billing/aged-debtors can open that statement's panel directly. `useSearchParams`
 * opts the subtree into client-side rendering, so it must sit behind a Suspense
 * boundary or the production build fails to prerender this route.
 */
export default function BillingPage() {
  return (
    <Suspense>
      <BillingDashboard />
    </Suspense>
  );
}
