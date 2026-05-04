"use client";

/**
 * SetKioskPinCard — small profile-section widget that lets staff set
 * (or change) their 4-digit kiosk PIN. Shown on My Portal.
 *
 * Visible state:
 *  - **Not set yet** (`kioskPinSetAt` is null) → "Set kiosk PIN" CTA
 *  - **Already set** → "Change PIN" link with a small explanation
 *
 * 2026-05-04: timeclock v1, sub-PR 4. The data — `kioskPinSetAt` —
 * comes through the existing `useMyPortal` hook on the parent page;
 * this component just receives the date prop and renders.
 */

import { useState } from "react";
import { Lock } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { useSetKioskPin } from "@/hooks/useTimeclock";
import { fetchApi } from "@/lib/fetch-api";
import { cn } from "@/lib/utils";

export function SetKioskPinCard() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data } = useQuery<{ pinSetAt: string | null }>({
    queryKey: ["my-kiosk-pin"],
    queryFn: () => fetchApi<{ pinSetAt: string | null }>(`/api/me/kiosk-pin`),
    retry: 2,
    staleTime: 5 * 60_000,
  });
  const pinSetAt = data?.pinSetAt ?? null;
  const isSet = pinSetAt !== null;
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-2">
      <header className="flex items-center gap-2">
        <Lock className="w-4 h-4 text-brand" />
        <h3 className="text-sm font-semibold text-foreground">Kiosk PIN</h3>
      </header>
      <p className="text-xs text-muted">
        {isSet
          ? `Set ${new Date(pinSetAt).toLocaleDateString("en-AU")}. Use it at the front-desk tablet to clock in.`
          : "Pick a 4-digit PIN to clock in at the front-desk tablet."}
      </p>
      <Button
        variant={isSet ? "secondary" : "primary"}
        size="sm"
        onClick={() => setOpen(true)}
      >
        {isSet ? "Change PIN" : "Set PIN"}
      </Button>
      {open && (
        <SetPinDialog
          onClose={() => setOpen(false)}
          onSet={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ["my-kiosk-pin"] });
          }}
        />
      )}
    </section>
  );
}

function SetPinDialog({
  onClose,
  onSet,
}: {
  onClose: () => void;
  onSet: () => void;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const set = useSetKioskPin();

  const valid =
    /^\d{4}$/.test(pin) && pin === confirm;

  async function submit() {
    setError(null);
    if (!valid) {
      setError("PIN must be exactly 4 digits and match the confirmation.");
      return;
    }
    try {
      await set.mutateAsync({ pin });
      onSet();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save PIN");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogTitle className="text-base font-semibold mb-3">
          Set your kiosk PIN
        </DialogTitle>
        <p className="text-xs text-muted mb-4">
          4 digits. Avoid obvious ones (1234, 0000, all-same).
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
              PIN
            </span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              autoFocus
              className="w-full rounded-lg border border-border px-3 py-2.5 text-sm bg-card focus:ring-2 focus:ring-brand min-h-[44px] tracking-[0.5em] font-mono"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
              Confirm PIN
            </span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-border px-3 py-2.5 text-sm bg-card focus:ring-2 focus:ring-brand min-h-[44px] tracking-[0.5em] font-mono"
            />
          </label>
          {error && (
            <p className="text-xs text-rose-600">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={set.isPending}
              className="min-h-[44px] px-4 py-2 text-sm font-medium text-muted"
            >
              Cancel
            </button>
            <Button
              variant="primary"
              size="md"
              onClick={submit}
              disabled={!valid || set.isPending}
              className={cn(set.isPending && "opacity-70")}
            >
              {set.isPending ? "Saving…" : "Save PIN"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
