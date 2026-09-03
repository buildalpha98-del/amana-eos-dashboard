/**
 * /my-expenses — Reimbursements destination (Staff Portal v2, Task 1.4).
 *
 * Thin shell per the Task 1.1 decision: PageHeader supports
 * title + description directly, so the page adds no chrome of its own —
 * everything lives in MyExpensesContent, which composes the existing
 * MyExpensesCard data layer and submit modal.
 */

import { MyExpensesContent } from "@/components/my-expenses/MyExpensesContent";

export const metadata = {
  title: "Reimbursements",
};

export default function MyExpensesPage() {
  return <MyExpensesContent />;
}
