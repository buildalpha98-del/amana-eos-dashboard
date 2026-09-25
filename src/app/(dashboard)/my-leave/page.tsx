/**
 * /my-leave — staff Leave destination (Staff Portal v2 Phase 1).
 *
 * Thin shell: all data + UI lives in MyLeaveContent, which reuses the
 * Employment-Hero-backed query layer shared with the /my-portal cards.
 */

import type { Metadata } from "next";
import { MyLeaveContent } from "@/components/my-leave/MyLeaveContent";

export const metadata: Metadata = {
  title: "Leave | Amana OSHC",
};

export default function MyLeavePage() {
  return <MyLeaveContent />;
}
