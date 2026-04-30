"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useCreateQrCode } from "@/hooks/useQrCodes";
import { fetchApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

interface ServiceLite {
  id: string;
  name: string;
}

interface CreateQrModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
  initialActivationId?: string;
  initialServiceId?: string;
  initialName?: string;
  initialDestination?: string;
}

export function CreateQrModal({
  open,
  onClose,
  onCreated,
  initialActivationId,
  initialServiceId,
  initialName,
  initialDestination,
}: CreateQrModalProps) {
  const create = useCreateQrCode();
  const [name, setName] = useState(initialName ?? "");
  const [description, setDescription] = useState("");
  const [destinationUrl, setDestinationUrl] = useState(initialDestination ?? "");
  const [serviceId, setServiceId] = useState(initialServiceId ?? "");
  const [services, setServices] = useState<ServiceLite[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(initialName ?? "");
    setDescription("");
    setDestinationUrl(initialDestination ?? "");
    setServiceId(initialServiceId ?? "");
    fetchApi<ServiceLite[] | { services: ServiceLite[] }>("/api/services?status=active")
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.services ?? [];
        setServices(list);
      })
      .catch(() => setServices([]));
  }, [open, initialName, initialDestination, initialServiceId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast({ variant: "destructive", description: "Name is required" });
      return;
    }
    if (!destinationUrl.trim()) {
      toast({ variant: "destructive", description: "Destination URL is required" });
      return;
    }
    try {
      const result = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        destinationUrl: destinationUrl.trim(),
        activationId: initialActivationId,
        serviceId: serviceId || undefined,
      });
      toast({ description: `QR code "${result.name}" created` });
      onCreated?.(result.id);
      onClose();
    } catch {
      // hook toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogTitle>New QR code</DialogTitle>
        <DialogDescription>
          Give it a label so you remember what it&apos;s for. Each scan logs the time and (best-effort) location;
          the Hub shows totals + unique visitors.
        </DialogDescription>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <Field label="Name / description *" hint="e.g. Minarah Term 2 flyer batch A">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Minarah Term 2 flyer batch A"
              className="w-full rounded-md border border-border bg-card p-2 text-sm"
            />
          </Field>
          <Field label="Destination URL *" hint="Where the scan should land — anywhere on the web.">
            <input
              type="url"
              required
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="https://amanaoshc.company/enquire?serviceId=…"
              className="w-full rounded-md border border-border bg-card p-2 text-sm font-mono"
            />
          </Field>
          <Field label="Linked centre (optional)">
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="w-full rounded-md border border-border bg-card p-2 text-sm"
            >
              <option value="">— None —</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Notes (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Anything you want to remember about this QR — print run size, where it&apos;s being displayed, etc."
              className="w-full rounded-md border border-border bg-card p-2 text-sm"
            />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={create.isPending}>Create QR</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  );
}
