"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { QrCode, Plus, ExternalLink } from "lucide-react";

interface QrSummary {
  id: string;
  shortCode: string;
  name: string;
  scanUrl: string;
  totals: { scans: number; uniqueVisitors: number };
  active: boolean;
}

interface ActivationQrLinkProps {
  activationId: string;
  serviceId: string;
  title: string;
}

function defaultDestination(serviceId: string): string {
  const base = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}`
    : "";
  return `${base}/enquire?serviceId=${serviceId}`;
}

export function ActivationQrLink({ activationId, serviceId, title }: ActivationQrLinkProps) {
  const [codes, setCodes] = useState<QrSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [destOverride, setDestOverride] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    try {
      const data = await fetchApi<{ codes: QrSummary[] }>(`/api/marketing/qr-codes?activationId=${activationId}&active=all`);
      setCodes(data.codes);
    } catch {
      setCodes([]);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activationId]);

  async function createQr() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const dest = destOverride.trim() || defaultDestination(serviceId);
      await mutateApi("/api/marketing/qr-codes", {
        method: "POST",
        body: {
          name: title,
          destinationUrl: dest,
          activationId,
          serviceId,
        },
      });
      toast({ description: "QR code created" });
      setCreating(false);
      setDestOverride("");
      await refresh();
    } catch (err) {
      toast({ variant: "destructive", description: (err as Error).message || "Could not create QR" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <header className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1.5">
          <QrCode className="w-3.5 h-3.5" />
          QR codes for this activation
        </h4>
        <Link
          href={`/marketing/qr-codes?activationId=${activationId}`}
          className="text-xs text-brand hover:underline inline-flex items-center gap-1"
        >
          Open hub <ExternalLink className="w-3 h-3" />
        </Link>
      </header>

      {codes === null ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : codes.length === 0 ? (
        <p className="text-xs text-muted mb-2">
          No QR codes yet for this activation. Create one below — or use the QR Hub for full management.
        </p>
      ) : (
        <ul className="space-y-1.5 mb-3">
          {codes.map((c) => (
            <li
              key={c.id}
              className={`rounded-md border p-2 text-xs flex items-center justify-between gap-2 ${
                c.active ? "border-border bg-card" : "border-dashed border-border bg-surface text-muted"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground truncate">
                  {c.name}
                  {!c.active && <span className="ml-1 text-[10px] text-muted">· archived</span>}
                </div>
                <div className="font-mono text-[10px] text-muted truncate">{c.scanUrl.replace(/^https?:\/\//, "")}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold text-foreground">{c.totals.uniqueVisitors}</div>
                <div className="text-[10px] text-muted">unique · {c.totals.scans} total</div>
              </div>
              <Link
                href={`/marketing/qr-codes?id=${c.id}`}
                className="text-[10px] text-brand hover:underline shrink-0"
              >
                Manage
              </Link>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <div className="rounded-md border border-border bg-surface p-3 space-y-2">
          <div>
            <label className="block text-[11px] text-muted mb-1">Destination URL (leave blank for default enquiry form)</label>
            <input
              type="url"
              value={destOverride}
              onChange={(e) => setDestOverride(e.target.value)}
              placeholder={defaultDestination(serviceId)}
              className="w-full rounded-md border border-border bg-card p-1.5 text-xs font-mono"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setCreating(false); setDestOverride(""); }}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={createQr} loading={submitting}>Create QR</Button>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          iconLeft={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setCreating(true)}
        >
          Create QR for this activation
        </Button>
      )}
    </section>
  );
}
