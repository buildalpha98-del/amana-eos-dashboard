"use client";

/**
 * Enrol another child (sibling).
 *
 * Re-opens the family's enrolment form with their details carried over and
 * sends them to its Child step — ONE form for first children and siblings,
 * so siblings get every fix the live form has (second-parent DOB, action
 * plans, direct-debit-only). Siblings used to go through the legacy wizard
 * in src/components/enrol, which had none of them.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { mutateApi } from "@/lib/fetch-api";

export default function NewChildPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutateApi("/api/parent/enrolment-draft/sibling", { method: "POST" })
      .then(async () => {
        // The form reads the draft through this query — drop the cached
        // (submitted) copy so it opens the re-opened one.
        await queryClient.invalidateQueries({ queryKey: ["parent", "enrolment-draft"] });
        router.replace("/parent/enrol");
      })
      .catch((err: unknown) =>
        setError(
          err instanceof Error
            ? err.message
            : "We couldn't start a new enrolment just now. Please try again.",
        ),
      );
  }, [queryClient, router]);

  if (error) {
    return (
      <div className="bg-card rounded-xl p-8 text-center shadow-sm border border-border space-y-3">
        <p className="text-sm text-foreground">{error}</p>
        <Link href="/parent/messages" className="text-sm font-medium text-brand underline">
          Message us for help
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-muted">
      <Loader2 className="w-6 h-6 animate-spin text-brand" />
      Setting up your new enrolment…
    </div>
  );
}
