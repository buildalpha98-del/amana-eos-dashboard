"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  Phone,
  Shield,
  Loader2,
  UserPlus,
  Users,
  Pencil,
} from "lucide-react";
import {
  useChildPickups,
  useAddChildPickup,
  useUpdateChildPickup,
  useDeleteChildPickup,
  type AuthorisedPickup,
} from "@/hooks/useChildProfile";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";

export function ChildPickupsTab({ childId }: { childId: string }) {
  const { data, isLoading, error } = useChildPickups(childId);
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<AuthorisedPickup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AuthorisedPickup | null>(null);
  const deletePickup = useDeleteChildPickup();

  const pickups = data?.pickups ?? [];

  const handleDelete = () => {
    if (!deleteTarget) return;
    deletePickup.mutate(
      { childId, pickupId: deleteTarget.id },
      { onSuccess: () => setDeleteTarget(null) },
    );
  };

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{pickups.length} authorised pickup{pickups.length !== 1 ? "s" : ""}</p>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Pickup
        </button>
      </div>

      {pickups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No authorised pickups"
          description="Add people who are authorised to collect this child."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {pickups.map((p) => (
            <PickupCard
              key={p.id}
              pickup={p}
              onEdit={() => setEditTarget(p)}
              onDelete={() => setDeleteTarget(p)}
            />
          ))}
        </div>
      )}

      {/* Add Dialog */}
      {showAdd && (
        <PickupFormDialog childId={childId} onClose={() => setShowAdd(false)} />
      )}

      {/* Edit Dialog */}
      {editTarget && (
        <PickupFormDialog
          childId={childId}
          pickup={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <Dialog open onOpenChange={() => setDeleteTarget(null)}>
          <DialogContent size="sm">
            <DialogTitle className="text-lg font-semibold text-foreground">
              Remove Pickup
            </DialogTitle>
            <p className="text-sm text-muted mt-2">
              Are you sure you want to remove <strong>{deleteTarget.name}</strong> as an authorised pickup?
            </p>
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-surface transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deletePickup.isPending}
                className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deletePickup.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Remove
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function PickupCard({
  pickup,
  onEdit,
  onDelete,
}: {
  pickup: AuthorisedPickup;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {pickup.photoUrl ? (
            <img
              src={pickup.photoUrl}
              alt={pickup.name}
              className="w-10 h-10 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center text-muted text-sm font-semibold">
              {pickup.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold text-foreground text-sm">{pickup.name}</p>
            <p className="text-xs text-muted">{pickup.relationship}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {pickup.isEmergencyContact && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-semibold">
              <Shield className="w-3 h-3" />
              Emergency
            </span>
          )}
          <button
            onClick={onEdit}
            className="p-1 rounded-md text-muted hover:text-brand hover:bg-brand/10 transition-colors"
            title="Edit pickup"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded-md text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Remove pickup"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {pickup.phone && (
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Phone className="w-3 h-3" />
          {pickup.phone}
        </div>
      )}
      {pickup.photoId && (
        <p className="text-xs text-muted">ID: {pickup.photoId}</p>
      )}
      {pickup.notes && (
        <p className="text-xs text-muted italic">{pickup.notes}</p>
      )}
    </div>
  );
}

function PickupFormDialog({
  childId,
  pickup,
  onClose,
}: {
  childId: string;
  pickup?: AuthorisedPickup;
  onClose: () => void;
}) {
  const addPickup = useAddChildPickup();
  const updatePickup = useUpdateChildPickup();
  const isEdit = Boolean(pickup);

  const [name, setName] = useState(pickup?.name ?? "");
  const [relationship, setRelationship] = useState(pickup?.relationship ?? "");
  const [phone, setPhone] = useState(pickup?.phone ?? "");
  const [photoId, setPhotoId] = useState(pickup?.photoId ?? "");
  const [isEmergency, setIsEmergency] = useState(pickup?.isEmergencyContact ?? false);
  const [notes, setNotes] = useState(pickup?.notes ?? "");

  const isPending = addPickup.isPending || updatePickup.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit && pickup) {
      updatePickup.mutate(
        {
          childId,
          pickupId: pickup.id,
          name: name.trim(),
          relationship: relationship.trim(),
          phone: phone.trim(),
          isEmergencyContact: isEmergency,
          notes: notes.trim() || null,
        },
        { onSuccess: () => onClose() },
      );
    } else {
      addPickup.mutate(
        {
          childId,
          name: name.trim(),
          relationship: relationship.trim(),
          phone: phone.trim(),
          photoId: photoId.trim() || null,
          isEmergencyContact: isEmergency,
          notes: notes.trim() || undefined,
        },
        { onSuccess: () => onClose() },
      );
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent size="md">
        <DialogTitle className="text-lg font-semibold text-foreground">
          <UserPlus className="w-5 h-5 inline mr-2 text-brand" />
          {isEdit ? "Edit Authorised Pickup" : "Add Authorised Pickup"}
        </DialogTitle>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Full Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Relationship *</label>
            <input
              type="text"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              required
              placeholder="e.g. Grandmother, Uncle, Family Friend"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
          {!isEdit && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Photo ID Description</label>
              <input
                type="text"
                value={photoId}
                onChange={(e) => setPhotoId(e.target.value)}
                placeholder="e.g. Driver's licence"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isEmergency}
              onChange={(e) => setIsEmergency(e.target.checked)}
              className="rounded border-border text-brand focus:ring-brand"
            />
            <span className="text-foreground">Emergency contact</span>
          </label>
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-lg border border-border text-foreground hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50 transition-colors"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isEdit ? "Save Changes" : "Add Pickup"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
