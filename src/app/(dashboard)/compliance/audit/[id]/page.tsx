"use client";

import { useParams } from "next/navigation";
import { AuditCompletionForm } from "@/components/compliance/AuditCompletionForm";

export default function AuditDetailPage() {
  const params = useParams();
  const id = params.id as string;
  return <AuditCompletionForm auditId={id} />;
}
