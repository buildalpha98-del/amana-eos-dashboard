"use client";

import { useState, useEffect } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { useCreateSeat, useUpdateSeat, type SeatNode } from "@/hooks/useAccountabilityChart";

interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

interface SeatEditModalProps {
  seat?: SeatNode;                    // Existing seat to edit (undefined = creating new)
  parentId?: string | null;           // Parent ID when creating a new seat
  allSeats: SeatNode[];               // Flat list of all seats (for parent dropdown)
  onClose: () => void;
}

export function SeatEditModal({ seat, parentId, allSeats, onClose }: SeatEditModalProps) {
  const isNew = !seat;
  const createSeat = useCreateSeat();
  const updateSeat = useUpdateSeat();

  const [title, setTitle] = useState(seat?.title || "");
  const [responsibilities, setResponsibilities] = useState<string[]>(
    seat?.responsibilities?.length ? [...seat.responsibilities] : [""]
  );
  const [selectedParentId, setSelectedParentId] = useState<string | null>(
    seat?.parentId ?? parentId ?? null
  );
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    seat?.assignees?.map((a) => a.id) || []
  );
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);

  // Fetch all users for assignee dropdown
  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => {
        const active = (Array.isArray(data) ? data : data.users || []).filter(
          (u: User & { active?: boolean }) => u.active !== false
        );
        setUsers(active);
      })
      .catch((err) => {
        if (process.env.NODE_ENV !== "production") console.warn("SeatEditModal: fetch users failed:", err);
      });
  }, []);

  const addResponsibility = () => setResponsibilities((r) => [...r, ""]);
  const removeResponsibility = (i: number) =>
    setResponsibilities((r) => r.filter((_, idx) => idx !== i));
  const updateResponsibility = (i: number, val: string) =>
    setResponsibilities((r) => r.map((v, idx) => (idx === i ? val : v)));

  const toggleAssignee = (userId: string) => {
    setAssigneeIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Prevent picking self or descendants as parent
  const getDescendantIds = (seatId: string): Set<string> => {
    const ids = new Set<string>();
    const walk = (nodes: SeatNode[]) => {
      for (const n of nodes) {
        if (n.id === seatId || ids.has(n.parentId || "")) {
          ids.add(n.id);
        }
        walk(n.children);
      }
    };
    walk(allSeats.filter((s) => s.parentId === seatId));
    return ids;
  };

  const excludedIds = seat ? new Set([seat.id, ...getDescendantIds(seat.id)]) : new Set<string>();
  const parentOptions = allSeats.filter((s) => !excludedIds.has(s.id));

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);

    const cleanedResponsibilities = responsibilities
      .map((r) => r.trim())
      .filter(Boolean);

    try {
      if (isNew) {
        await createSeat.mutateAsync({
          title: title.trim(),
          responsibilities: cleanedResponsibilities,
          parentId: selectedParentId,
          assigneeIds,
        });
      } else {
        await updateSeat.mutateAsync({
          id: seat.id,
          title: title.trim(),
          responsibilities: cleanedResponsibilities,
          parentId: selectedParentId,
          assigneeIds,
        });
      }
      onClose();
    } catch {
      // Error handled by mutation
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card rounded-t-xl z-10">
          <h2 className="text-lg font-semibold text-foreground">
            {isNew ? "Add New Seat" : `Edit "${seat.title}"`}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-muted hover:text-foreground rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Seat Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Marketing, Operations, State Manager"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          {/* Parent Seat */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Reports To
            </label>
            <select
              value={selectedParentId || ""}
              onChange={(e) => setSelectedParentId(e.target.value || null)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent bg-card"
            >
              <option value="">None (Top Level)</option>
              {parentOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                  {s.assignees.length > 0
                    ? ` — ${s.assignees.map((a) => a.name).join(", ")}`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Assignees */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              People in this Seat
            </label>
            <div className="border border-border rounded-lg max-h-40 overflow-y-auto">
              {users.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted">Loading users...</p>
              ) : (
                users.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-surface cursor-pointer border-b border-border/50 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={assigneeIds.includes(u.id)}
                      onChange={() => toggleAssignee(u.id)}
                      className="w-4 h-4 rounded border-border text-brand focus:ring-brand"
                    />
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold text-brand">
                          {u.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate">{u.name}</p>
                        <p className="text-xs text-muted truncate">{u.email}</p>
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>
            {assigneeIds.length > 0 && (
              <p className="text-xs text-muted mt-1">
                {assigneeIds.length} person(s) selected
              </p>
            )}
          </div>

          {/* Responsibilities */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Responsibilities
            </label>
            <div className="space-y-2">
              {responsibilities.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={r}
                    onChange={(e) => updateResponsibility(i, e.target.value)}
                    placeholder="e.g. LMA, Revenue & GP, Compliance..."
                    className="flex-1 px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addResponsibility();
                      }
                    }}
                  />
                  {responsibilities.length > 1 && (
                    <button
                      onClick={() => removeResponsibility(i)}
                      className="p-1 text-muted hover:text-danger"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addResponsibility}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-hover"
            >
              <Plus className="w-3.5 h-3.5" />
              Add responsibility
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3 sticky bottom-0 bg-card rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground/80 border border-border rounded-lg hover:bg-surface"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : isNew ? "Create Seat" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
