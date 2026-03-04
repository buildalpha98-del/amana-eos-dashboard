"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  useAccountabilityChart,
  useCreateSeat,
  useDeleteSeat,
  type SeatNode,
} from "@/hooks/useAccountabilityChart";
import { SeatEditModal } from "./SeatEditModal";
import { Plus, Pencil, Trash2, User, ChevronDown, ChevronRight } from "lucide-react";

// ---------- Seat Card ----------

function SeatCard({
  seat,
  canEdit,
  onEdit,
  onAddChild,
  onDelete,
}: {
  seat: SeatNode;
  canEdit: boolean;
  onEdit: () => void;
  onAddChild: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white border-2 border-[#D4A843] rounded-xl shadow-sm w-56 group/card hover:shadow-md transition-shadow">
      {/* Title bar */}
      <div className="bg-[#004E64] rounded-t-[10px] px-3 py-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-white truncate">{seat.title}</h3>
        {canEdit && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-1 text-white/70 hover:text-white rounded"
              title="Edit seat"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAddChild(); }}
              className="p-1 text-white/70 hover:text-white rounded"
              title="Add child seat"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="p-1 text-white/70 hover:text-red-300 rounded"
              title="Delete seat"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Assignees */}
      <div className="px-3 py-2 border-b border-gray-100">
        {seat.assignees.length > 0 ? (
          <div className="space-y-1">
            {seat.assignees.map((a) => (
              <div key={a.id} className="flex items-center gap-1.5">
                {a.avatar ? (
                  <img
                    src={a.avatar}
                    alt={a.name}
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-[#004E64]/10 flex items-center justify-center">
                    <span className="text-[8px] font-bold text-[#004E64]">
                      {a.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                  </div>
                )}
                <span className="text-xs font-medium text-gray-800 truncate">
                  {a.name}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-gray-400">
            <User className="w-4 h-4" />
            <span className="text-xs italic">Unassigned</span>
          </div>
        )}
      </div>

      {/* Responsibilities */}
      {seat.responsibilities.length > 0 && (
        <div className="px-3 py-2">
          <ul className="space-y-0.5">
            {seat.responsibilities.map((r, i) => (
              <li key={i} className="text-[11px] text-gray-600 flex items-start gap-1.5">
                <span className="text-gray-400 mt-0.5 shrink-0">&bull;</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------- Recursive Tree Node ----------

function TreeNode({
  seat,
  canEdit,
  onEditSeat,
  onAddChild,
  onDeleteSeat,
  isRoot,
}: {
  seat: SeatNode;
  canEdit: boolean;
  onEditSeat: (seat: SeatNode) => void;
  onAddChild: (parentId: string) => void;
  onDeleteSeat: (seat: SeatNode) => void;
  isRoot?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = seat.children.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* The card itself */}
      <div className="relative">
        <SeatCard
          seat={seat}
          canEdit={canEdit}
          onEdit={() => onEditSeat(seat)}
          onAddChild={() => onAddChild(seat.id)}
          onDelete={() => onDeleteSeat(seat)}
        />
        {/* Collapse/expand toggle */}
        {hasChildren && (
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 w-5 h-5 bg-white border border-gray-300 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50"
          >
            {collapsed ? (
              <ChevronRight className="w-3 h-3 text-gray-500" />
            ) : (
              <ChevronDown className="w-3 h-3 text-gray-500" />
            )}
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && !collapsed && (
        <>
          {/* Vertical connector from parent */}
          <div className="w-px h-8 bg-gray-300" />

          {/* Children row with horizontal connector */}
          {seat.children.length === 1 ? (
            <TreeNode
              seat={seat.children[0]}
              canEdit={canEdit}
              onEditSeat={onEditSeat}
              onAddChild={onAddChild}
              onDeleteSeat={onDeleteSeat}
            />
          ) : (
            <div className="relative">
              {/* Horizontal line spanning all children */}
              <div className="absolute top-0 left-[calc(50%/(var(--child-count)))] right-[calc(50%/(var(--child-count)))] h-px bg-gray-300"
                style={{
                  left: `calc(100% / ${seat.children.length * 2})`,
                  right: `calc(100% / ${seat.children.length * 2})`,
                }}
              />
              <div className="flex items-start gap-6">
                {seat.children.map((child) => (
                  <div key={child.id} className="flex flex-col items-center">
                    {/* Vertical drop line to child */}
                    <div className="w-px h-6 bg-gray-300" />
                    <TreeNode
                      seat={child}
                      canEdit={canEdit}
                      onEditSeat={onEditSeat}
                      onAddChild={onAddChild}
                      onDeleteSeat={onDeleteSeat}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Main OrgChartView ----------

export function OrgChartView() {
  const { data: tree, isLoading } = useAccountabilityChart();
  const createSeat = useCreateSeat();
  const deleteSeat = useDeleteSeat();
  const { data: session } = useSession();

  const canEdit = session?.user?.role === "owner" || session?.user?.role === "admin";

  const [editingSeat, setEditingSeat] = useState<SeatNode | null>(null);
  const [creatingParentId, setCreatingParentId] = useState<string | null | "root">(null);
  const [deleteConfirm, setDeleteConfirm] = useState<SeatNode | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-[#004E64] rounded-full animate-spin" />
      </div>
    );
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteSeat.mutateAsync(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  const isEmpty = !tree || tree.length === 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 overflow-x-auto">
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Plus className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No accountability chart yet
          </h3>
          <p className="text-gray-500 text-sm mb-4 max-w-md">
            Define your organisational structure by adding seats. Start with
            the top-level role (e.g. Visionary) and build your tree.
          </p>
          {canEdit && (
            <button
              onClick={() => setCreatingParentId("root")}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#004E64] text-white rounded-lg hover:bg-[#003D52] transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add First Seat
            </button>
          )}
        </div>
      ) : (
        <div className="min-w-fit flex flex-col items-center">
          {/* Add root seat button */}
          {canEdit && (
            <div className="flex justify-end w-full mb-4">
              <button
                onClick={() => setCreatingParentId("root")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#004E64] border border-[#004E64]/30 rounded-lg hover:bg-[#004E64]/5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Root Seat
              </button>
            </div>
          )}

          {/* Tree */}
          <div className="flex flex-col items-center gap-0">
            {tree!.map((root, i) => (
              <div key={root.id} className={i > 0 ? "mt-8" : ""}>
                <TreeNode
                  seat={root}
                  canEdit={canEdit}
                  onEditSeat={setEditingSeat}
                  onAddChild={setCreatingParentId}
                  onDeleteSeat={setDeleteConfirm}
                  isRoot
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingSeat && (
        <SeatEditModal
          seat={editingSeat}
          allSeats={flattenTree(tree || [])}
          onClose={() => setEditingSeat(null)}
        />
      )}

      {/* Create Modal */}
      {creatingParentId !== null && (
        <SeatEditModal
          parentId={creatingParentId === "root" ? null : creatingParentId}
          allSeats={flattenTree(tree || [])}
          onClose={() => setCreatingParentId(null)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Delete &ldquo;{deleteConfirm.title}&rdquo;?
            </h3>
            <p className="text-sm text-gray-500 mb-1">
              This will remove the seat from the chart.
            </p>
            {deleteConfirm.children.length > 0 && (
              <p className="text-sm text-amber-600 mb-4">
                Its {deleteConfirm.children.length} child seat(s) will be moved
                up to the parent level.
              </p>
            )}
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteSeat.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteSeat.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Helpers ----------

function flattenTree(nodes: SeatNode[]): SeatNode[] {
  const result: SeatNode[] = [];
  const walk = (list: SeatNode[]) => {
    for (const n of list) {
      result.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return result;
}
