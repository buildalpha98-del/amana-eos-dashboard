"use client";

import { useState, useEffect, useMemo } from "react";
import { Save } from "lucide-react";
import {
  useActivationAssignments,
  useUpdateActivationAssignments,
} from "@/hooks/useMarketing";
import { toast } from "@/hooks/useToast";

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

interface UserOption {
  id: string;
  name: string;
}

interface RowData {
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  assigned: boolean;
  coordinatorId: string | null;
  budget: number | null;
  notes: string | null;
  status: string;
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", color: "bg-gray-100 text-gray-600" },
  { value: "confirmed", label: "Confirmed", color: "bg-blue-100 text-blue-700" },
  { value: "completed", label: "Completed", color: "bg-emerald-100 text-emerald-700" },
];

export function ActivationAssignmentGrid({
  campaignId,
}: {
  campaignId: string;
}) {
  const { data: assignments, isLoading: loadingAssignments } =
    useActivationAssignments(campaignId);
  const updateAssignments = useUpdateActivationAssignments();

  const [services, setServices] = useState<ServiceOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [rows, setRows] = useState<RowData[]>([]);
  const [dirty, setDirty] = useState(false);

  // Fetch services
  useEffect(() => {
    fetch("/api/services")
      .then((res) => res.json())
      .then((data: ServiceOption[]) => {
        // Handle both paginated { items } and plain array responses
        const list = Array.isArray(data) ? data : (data as { items: ServiceOption[] }).items ?? [];
        setServices(list);
      })
      .catch(() => {});
  }, []);

  // Fetch users for coordinator dropdown
  useEffect(() => {
    fetch("/api/users")
      .then((res) => res.json())
      .then((data: UserOption[]) => setUsers(data))
      .catch(() => {});
  }, []);

  // Merge services with existing assignments
  const mergedRows = useMemo(() => {
    if (!services.length) return [];

    const assignmentMap = new Map(
      (assignments ?? []).map((a) => [a.serviceId, a])
    );

    return services.map((svc): RowData => {
      const existing = assignmentMap.get(svc.id);
      return {
        serviceId: svc.id,
        serviceName: svc.name,
        serviceCode: svc.code,
        assigned: existing?.assigned ?? false,
        coordinatorId: existing?.coordinatorId ?? null,
        budget: existing?.budget ?? null,
        notes: existing?.notes ?? null,
        status: existing?.status ?? "pending",
      };
    });
  }, [services, assignments]);

  // Sync merged rows into local state when data changes (but not when dirty)
  useEffect(() => {
    if (!dirty && mergedRows.length > 0) {
      setRows(mergedRows);
    }
  }, [mergedRows, dirty]);

  const updateRow = (serviceId: string, field: keyof RowData, value: unknown) => {
    setDirty(true);
    setRows((prev) =>
      prev.map((r) =>
        r.serviceId === serviceId ? { ...r, [field]: value } : r
      )
    );
  };

  const handleSave = () => {
    const payload = rows
      .filter((r) => r.assigned)
      .map((r) => ({
        serviceId: r.serviceId,
        assigned: r.assigned,
        coordinatorId: r.coordinatorId,
        budget: r.budget,
        notes: r.notes,
        status: r.status,
      }));

    // Also include rows that were previously assigned but now unassigned
    const unassigned = rows
      .filter((r) => !r.assigned)
      .map((r) => ({
        serviceId: r.serviceId,
        assigned: false,
        coordinatorId: null,
        budget: null,
        notes: null,
        status: "pending",
      }));

    updateAssignments.mutate(
      { campaignId, assignments: [...payload, ...unassigned] },
      {
        onSuccess: () => {
          setDirty(false);
          toast({ description: "Centre assignments saved successfully." });
        },
        onError: () => {
          toast({
            description: "Failed to save assignments.",
            variant: "destructive",
          });
        },
      }
    );
  };

  if (loadingAssignments && !services.length) {
    return (
      <p className="text-sm text-gray-400 py-2">
        Loading centre assignments...
      </p>
    );
  }

  if (!services.length) {
    return (
      <p className="text-sm text-gray-400 py-2">No centres available.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                Centre
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500 w-16">
                Assigned
              </th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                Coordinator
              </th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 w-24">
                Budget
              </th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 w-28">
                Status
              </th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                Notes
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr
                key={row.serviceId}
                className={
                  row.assigned ? "bg-white" : "bg-gray-50/50 opacity-60"
                }
              >
                {/* Centre */}
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="font-medium text-gray-800">
                    {row.serviceName}
                  </span>
                  <span className="ml-1.5 text-xs text-gray-400">
                    ({row.serviceCode})
                  </span>
                </td>

                {/* Assigned checkbox */}
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={row.assigned}
                    onChange={(e) =>
                      updateRow(row.serviceId, "assigned", e.target.checked)
                    }
                    className="h-4 w-4 rounded border-gray-300 text-[#004E64] focus:ring-[#004E64]"
                  />
                </td>

                {/* Coordinator dropdown */}
                <td className="px-3 py-2">
                  <select
                    value={row.coordinatorId ?? ""}
                    onChange={(e) =>
                      updateRow(
                        row.serviceId,
                        "coordinatorId",
                        e.target.value || null
                      )
                    }
                    disabled={!row.assigned}
                    className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64] disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">--</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </td>

                {/* Budget */}
                <td className="px-3 py-2">
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.budget ?? ""}
                      onChange={(e) =>
                        updateRow(
                          row.serviceId,
                          "budget",
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                      disabled={!row.assigned}
                      placeholder="0"
                      className="w-full rounded border border-gray-200 bg-white pl-5 pr-2 py-1 text-xs focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64] disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  </div>
                </td>

                {/* Status */}
                <td className="px-3 py-2">
                  <select
                    value={row.status}
                    onChange={(e) =>
                      updateRow(row.serviceId, "status", e.target.value)
                    }
                    disabled={!row.assigned}
                    className={`w-full rounded-full px-2 py-1 text-[10px] font-medium border-0 focus:outline-none focus:ring-1 focus:ring-[#004E64] disabled:cursor-not-allowed ${
                      STATUS_OPTIONS.find((s) => s.value === row.status)
                        ?.color ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>

                {/* Notes */}
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={row.notes ?? ""}
                    onChange={(e) =>
                      updateRow(
                        row.serviceId,
                        "notes",
                        e.target.value || null
                      )
                    }
                    disabled={!row.assigned}
                    placeholder="Notes..."
                    className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-[#004E64] focus:outline-none focus:ring-1 focus:ring-[#004E64] disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!dirty || updateAssignments.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#004E64] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#003d4f] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="h-3.5 w-3.5" />
          {updateAssignments.isPending ? "Saving..." : "Save All"}
        </button>
      </div>
    </div>
  );
}
