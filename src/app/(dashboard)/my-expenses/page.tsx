import { redirect } from "next/navigation";

/** Expenses now live on My Pay & Leave (2026-10-08). Old links keep working. */
export default function MyExpensesPage() {
  redirect("/my-pay?tab=expenses");
}
