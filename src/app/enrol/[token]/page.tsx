"use client";

import { useParams } from "next/navigation";
import { EnrolmentWizard } from "@/components/enrol/EnrolmentWizard";

export default function EnrolWithTokenPage() {
  const params = useParams();
  const token = params.token as string;
  return <EnrolmentWizard prefillToken={token} />;
}
