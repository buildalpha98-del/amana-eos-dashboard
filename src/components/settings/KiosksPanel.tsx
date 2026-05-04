"use client";

/**
 * KiosksPanel — admin settings surface for time-clock kiosks.
 *
 * Lists all registered kiosks (or filtered by service) with their
 * `lastSeenAt`, `revokedAt`, label. Register flow opens a modal that
 * picks a service + label, calls POST /api/kiosks, then shows the
 * one-time bearer token in a copy-to-clipboard panel. Once the
 * admin closes the panel, the token is gone — they have to revoke
 * and re-register.
 *
 * 2026-05-04: timeclock v1, sub-PR 4.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Smartphone,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { fetchApi } from "@/lib/fetch-api";
import {
  useKiosks,
  useRegisterKiosk,
  useRevokeKiosk,
  type KioskRow,
} from "@/hooks/useKiosks";
import { cn } from "@/lib/utils";

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function KiosksPanel() {
  const { data, isLoading } = useKiosks();
  const [registerOpen, setRegisterOpen] = useState(false);

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold">Front-desk kiosks</h3>
        </div>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Plus className="w-4 h-4" />}
          onClick={() => setRegisterOpen(true)}
        >
          Register
        </Button>
      </header>

      <p className="text-xs text-muted">
        Pair a front-desk tablet with a time-clock kiosk so staff can clock
        in/out with a name + 4-digit PIN. Revoke a kiosk if a tablet is lost
        or you're switching devices.
      </p>

      {isLoading ? (
        <div className="text-xs text-muted py-3">Loading…</div>
      ) : !data?.kiosks?.length ? (
        <p className="text-xs text-muted py-3">
          No kiosks registered yet. Register one and paste the token into the
          tablet at <code>/kiosk</code>.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {data.kiosks.map((k) => (
            <KioskRowItem key={k.id} kiosk={k} />
          ))}
        </ul>
      )}

      {registerOpen && (
        <RegisterKioskDialog onClose={() => setRegisterOpen(false)} />
      )}
    </section>
  );
}

function KioskRowItem({ kiosk }: { kiosk: KioskRow }) {
  const revoke = useRevokeKiosk();
  const [confirming, setConfirming] = useState(false);
  const isRevoked = kiosk.revokedAt !== null;
  return (
    <li className="py-2 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {kiosk.label}
          </span>
          {isRevoked && (
            <span className="text-[10px] uppercase tracking-wide font-medium text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
              revoked
            </span>
          )}
        </div>
        <p className="text-xs text-muted">
          {kiosk.service?.name ?? kiosk.serviceId} · last seen{" "}
          {formatDate(kiosk.lastSeenAt)}
          {kiosk.createdBy ? ` · registered by ${kiosk.createdBy.name}` : ""}
        </p>
      </div>
      {!isRevoked &&
        (confirming ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => revoke.mutate({ id: kiosk.id })}
              disabled={revoke.isPending}
              className="text-xs px-2 py-1 rounded bg-rose-600 text-white"
            >
              {revoke.isPending ? "…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs px-2 py-1 rounded text-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-rose-600 hover:text-rose-700 transition-colors"
            aria-label="Revoke kiosk"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ))}
    </li>
  );
}

function RegisterKioskDialog({ onClose }: { onClose: () => void }) {
  const { data: services } = useQuery<{ services: ServiceOption[] }>({
    queryKey: ["services-light"],
    queryFn: () => fetchApi<{ services: ServiceOption[] }>(`/api/services`),
    retry: 2,
  });
  const register = useRegisterKiosk();
  const [serviceId, setServiceId] = useState("");
  const [label, setLabel] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const valid = !!serviceId && label.trim().length > 0;

  async function submit() {
    if (!valid) return;
    try {
      const result = await register.mutateAsync({
        serviceId,
        label: label.trim(),
      });
      setToken(result.token);
    } catch {
      /* error toast already fired */
    }
  }

  async function copyToken() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard rejection is non-fatal */
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogTitle className="text-base font-semibold mb-3">
          {token ? "Kiosk registered" : "Register a kiosk"}
        </DialogTitle>

        {!token ? (
          <div className="space-y-3">
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
                Service
              </span>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm bg-card min-h-[44px]"
              >
                <option value="">— pick a service —</option>
                {(services?.services ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
                Label
              </span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Front desk iPad"
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm bg-card min-h-[44px]"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={register.isPending}
                className="min-h-[44px] px-4 py-2 text-sm font-medium text-muted"
              >
                Cancel
              </button>
              <Button
                variant="primary"
                size="md"
                onClick={submit}
                disabled={!valid || register.isPending}
              >
                {register.isPending ? "Registering…" : "Register"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Copy the token now.</strong> We don't store the
                plaintext — you can't see it again. If you lose it, revoke
                and re-register.
              </div>
            </div>
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
                Bearer token
              </span>
              <textarea
                value={token}
                readOnly
                rows={3}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-border px-3 py-2 text-xs bg-surface font-mono"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={copyToken}
                className={cn(
                  "min-h-[44px] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg",
                  "border border-border text-sm font-medium",
                  "hover:bg-surface transition-colors",
                )}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> Copy token
                  </>
                )}
              </button>
              <Button variant="primary" size="md" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
