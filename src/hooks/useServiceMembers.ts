"use client";

/**
 * useServiceMembers — assignee picker scope for the per-service EOS tabs.
 *
 * 2026-04-30 training-session feedback: when staff create a Todo, Rock,
 * Scorecard measurable, or Issue from inside a service detail page, the
 * assignee dropdown was showing every active user in the org. Director of
 * Service should only be picking from people who actually work at their
 * centre.
 *
 * Issues are the one exception — escalation up to State Manager
 * (head_office) is part of the IDS workflow, so the picker for Issues
 * passes `includeStateManagers: true` and we merge in head_office users.
 *
 * Owner is intentionally NOT auto-included — they're org-wide and rarely
 * the right assignee for a service-level EOS item. They can still be
 * assigned via the cross-service /todos / /rocks / /issues pages.
 */

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";

export interface ServiceMember {
  id: string;
  name: string;
  email: string;
  role: string;
  serviceId: string | null;
  avatar?: string | null;
}

interface UseServiceMembersOptions {
  /**
   * When true, head_office (State Manager) users are merged in regardless of
   * whether they're assigned to this service. Use for Issues pickers so
   * service-level escalations can reach the State Manager.
   */
  includeStateManagers?: boolean;
}

async function fetchUsers(query: string): Promise<ServiceMember[]> {
  const data = await fetchApi<ServiceMember[]>(`/api/users${query}`);
  return Array.isArray(data) ? data : [];
}

export function useServiceMembers(
  serviceId: string | undefined,
  opts: UseServiceMembersOptions = {},
) {
  const includeStateManagers = !!opts.includeStateManagers;

  return useQuery<ServiceMember[]>({
    queryKey: ["service-members", serviceId ?? null, includeStateManagers],
    queryFn: async () => {
      if (!serviceId) return [];
      // 1. Pull active people actually assigned to this service.
      const assigned = await fetchUsers(
        `?serviceId=${encodeURIComponent(serviceId)}&active=true`,
      );
      if (!includeStateManagers) return assigned;

      // 2. Issues escalation — merge in active head_office users.
      const stateManagers = await fetchUsers(`?role=head_office&active=true`);
      const seen = new Set(assigned.map((u) => u.id));
      const merged = [...assigned];
      for (const sm of stateManagers) {
        if (!seen.has(sm.id)) merged.push(sm);
      }
      return merged;
    },
    enabled: !!serviceId,
    retry: 2,
    staleTime: 60_000,
  });
}
