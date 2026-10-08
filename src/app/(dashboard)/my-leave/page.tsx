import { redirect } from "next/navigation";

/** Leave now lives on My Pay & Leave (2026-10-08). Old links keep working. */
export default function MyLeavePage() {
  redirect("/my-pay?tab=leave");
}
