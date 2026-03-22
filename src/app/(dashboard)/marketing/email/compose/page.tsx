import { Suspense } from "react";
import { EmailComposer } from "@/components/email/EmailComposer";

export default function EmailComposePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16 text-muted">Loading composer...</div>}>
      <EmailComposer />
    </Suspense>
  );
}
