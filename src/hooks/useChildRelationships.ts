"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

/**
 * Partial patch body for PATCH /api/children/[id]/relationships.
 *
 * All three keys are optional — the server does a read-merge-write per-key
 * so a caller can patch just one list without sending the others.
 */
interface PatchBody {
  secondaryParent?: unknown;
  emergencyContacts?: unknown[];
  authorisedPickup?: unknown[];
}

/**
 * Mutation hook for editing a child's relationship JSON fields (secondary
 * carer, emergency contacts, authorised pickups).
 *
 * Primary carer is NOT patchable via this endpoint — use the enrolment flow.
 *
 * `onSuccess` invalidates both the single-child cache key and the children
 * list cache key so parent names surface everywhere immediately.
 */
export function useChildRelationships(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchBody) =>
      mutateApi(`/api/children/${childId}/relationships`, {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["child", childId] });
      // List queries may surface parent names / emergency contacts for this
      // child — invalidate those too.
      qc.invalidateQueries({ queryKey: ["children"] });
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        description: err.message || "Something went wrong",
      });
    },
  });
}
