"use client";

/**
 * Dialogs for the door screen (ServiceRollCallTab — "Sign in & out").
 *
 * SignDialog captures WHO is handing over or collecting. That's the part
 * Regulation 158 cares about: "signed out at 5:42pm by nobody in
 * particular" isn't a record, so the name is required. A drawn signature
 * is added when the centre's Sign in & out setting asks for one (the
 * server enforces that too).
 *
 * BulkDialog confirms a whole-programme sign-in or sign-out, with a note
 * for the register saying who did the hand-over.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { SignaturePad } from "@/components/contracts/SignaturePad";

export function useRequireSignature(serviceId: string): boolean {
  const { data } = useQuery<{ settings: { signInOut: { requireSignature: boolean } } }>({
    queryKey: ["service", serviceId, "app-settings"],
    queryFn: () => fetchApi(`/api/services/${serviceId}/app-settings`),
    staleTime: 60_000,
    retry: 1,
  });
  return data?.settings.signInOut?.requireSignature ?? false;
}

export function SignDialog({
  serviceId,
  childFirstName,
  action,
  defaultName,
  onConfirm,
  onCancel,
}: {
  serviceId: string;
  childFirstName: string;
  action: "in" | "out";
  /** Pre-filled: whoever signed in is usually who collects. */
  defaultName?: string | null;
  onConfirm: (who: { signedByName: string; signature?: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(defaultName ?? "");
  const [signature, setSignature] = useState<string | null>(null);
  const needsSignature = useRequireSignature(serviceId);
  const verb = action === "in" ? "dropping off" : "collecting";

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogTitle>
          Sign {action} {childFirstName}
        </DialogTitle>
        <DialogDescription>
          {action === "in"
            ? "Who is dropping off? This goes on the attendance register."
            : "Who is collecting? Check they're an authorised person."}
        </DialogDescription>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || (needsSignature && !signature)) return;
            onConfirm({
              signedByName: name.trim(),
              ...(needsSignature && signature ? { signature } : {}),
            });
          }}
        >
          <div>
            <label htmlFor="door-sign-name" className="mb-1 block text-sm font-medium">
              Name of person {verb}
            </label>
            <input
              id="door-sign-name"
              autoFocus
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-lg border border-border bg-card px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          {needsSignature && (
            <SignaturePad
              label={`Signature of person ${verb}`}
              onChange={setSignature}
              width={360}
              height={140}
            />
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || (needsSignature && !signature)}>
              Confirm sign {action}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BulkDialog({
  action,
  count,
  roomName,
  defaultNote,
  isPending,
  onConfirm,
  onCancel,
}: {
  action: "in" | "out";
  count: number;
  roomName: string;
  defaultNote: string;
  isPending: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState(defaultNote);
  return (
    <Dialog open onOpenChange={(o) => !o && !isPending && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogTitle>
          Sign {action} {count} {count === 1 ? "child" : "children"}?
        </DialogTitle>
        <DialogDescription>
          {action === "in"
            ? `Everyone in ${roomName} who hasn't arrived and isn't marked absent. Only do this once they're all with you.`
            : `Everyone in ${roomName} who is still here. Use this when educators take the group — a parent collecting signs out one child at a time.`}
        </DialogDescription>
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="door-bulk-note" className="mb-1 block text-sm font-medium">
              For the register
            </label>
            <input
              id="door-bulk-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={onCancel} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={() => onConfirm(note.trim())} disabled={!note.trim() || isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                `Sign ${action} ${count}`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
