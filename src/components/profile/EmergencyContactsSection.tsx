"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Trash2, Loader2, Star } from "lucide-react";
import { toast } from "@/hooks/useToast";
import type { EmergencyContactData } from "@/hooks/useMyPortal";

/**
 * Emergency contacts on the staff-facing profile.
 *
 * 2026-08-25: the induction gate counts an emergency contact as part of
 * "profile complete", and the blocker links here — but this page had no field
 * for one. The only editor was the admin /staff/[id] Personal tab, which staff
 * cannot reach (and which locked staff certainly cannot). Result: 0 of 82
 * active staff had a contact on file, so nobody could satisfy the gate no
 * matter how much training they finished.
 *
 * The API already allowed self-service (`isSelf` on both routes) — this was
 * purely a missing UI.
 */

const inputCls =
  "w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand";

type Draft = { name: string; phone: string; relationship: string; isPrimary: boolean };
const EMPTY: Draft = { name: "", phone: "", relationship: "", isPrimary: false };

export function EmergencyContactsSection({
  userId,
  contacts,
}: {
  userId: string;
  contacts: EmergencyContactData[];
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["profile", userId] });
    // The induction banner reads the same completeness signal.
    queryClient.invalidateQueries({ queryKey: ["induction-readiness"] });
  };

  const addContact = useMutation({
    mutationFn: async (body: Draft) => {
      const res = await fetch(`/api/users/${userId}/emergency-contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Could not save contact");
      }
      return res.json();
    },
    onSuccess: () => {
      setDraft(null);
      invalidate();
      toast({ description: "Emergency contact saved." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const removeContact = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/emergency-contacts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Could not remove contact");
      }
    },
    onSuccess: () => {
      invalidate();
      toast({ description: "Emergency contact removed." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", description: err.message || "Something went wrong" });
    },
  });

  const canSave =
    !!draft?.name.trim() && !!draft?.phone.trim() && !!draft?.relationship.trim();

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Users className="w-4 h-4 text-muted" />
            Emergency Contacts
          </h3>
          <p className="text-xs text-muted mt-1">
            Who we call if something happens while you&apos;re at work. At least one
            is required before you can be rostered.
          </p>
        </div>
        {!draft && (
          <button
            type="button"
            onClick={() => setDraft(EMPTY)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted/10"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        )}
      </div>

      {contacts.length === 0 && !draft && (
        <p className="text-sm text-muted rounded-lg border border-dashed border-border px-4 py-6 text-center">
          No emergency contact yet — add one to finish your profile.
        </p>
      )}

      {contacts.length > 0 && (
        <ul className="space-y-2 mb-4">
          {contacts.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <span className="truncate">{c.name}</span>
                  {c.isPrimary && (
                    <Star
                      className="w-3.5 h-3.5 text-brand shrink-0"
                      aria-label="Primary contact"
                    />
                  )}
                </p>
                <p className="text-xs text-muted truncate">
                  {c.relationship} · {c.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeContact.mutate(c.id)}
                disabled={removeContact.isPending}
                aria-label={`Remove ${c.name}`}
                className="shrink-0 rounded-lg p-2 text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              className={inputCls}
              placeholder="Full name"
              aria-label="Contact name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <input
              className={inputCls}
              type="tel"
              placeholder="Phone e.g. 0412 345 678"
              aria-label="Contact phone"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
            <input
              className={inputCls}
              placeholder="Relationship e.g. Partner"
              aria-label="Relationship"
              value={draft.relationship}
              onChange={(e) => setDraft({ ...draft, relationship: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={draft.isPrimary}
              onChange={(e) => setDraft({ ...draft, isPrimary: e.target.checked })}
            />
            Primary contact — call this person first
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canSave || addContact.isPending}
              onClick={() => draft && addContact.mutate(draft)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {addContact.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Save contact
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
