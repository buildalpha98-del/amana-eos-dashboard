import { Suspense } from "react";
import type { Metadata } from "next";
import { PayLeaveHub } from "@/components/my-hub/PayLeaveHub";

export const metadata: Metadata = {
  title: "Pay & Leave",
};

/**
 * My Pay & Leave (2026-10-08): pay, leave and expenses as tabs on one
 * page. /my-leave and /my-expenses redirect here with ?tab=.
 */
export default function MyPayPage() {
  return (
    <Suspense fallback={null}>
      <PayLeaveHub />
    </Suspense>
  );
}
