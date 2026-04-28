"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  useActivationQr,
  useActivationQrStats,
  usePatchActivationQr,
} from "@/hooks/useActivationQr";
import { toast } from "@/hooks/useToast";
import { Copy, Download, RefreshCw, ExternalLink, QrCode } from "lucide-react";

interface QrPanelProps {
  activationId: string;
  serviceName: string;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function shortenUserAgent(ua: string | null): string {
  if (!ua) return "—";
  if (ua.includes("iPhone")) return "iPhone";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPad")) return "iPad";
  if (ua.includes("Mac")) return "Mac";
  if (ua.includes("Windows")) return "Windows";
  return ua.slice(0, 40);
}

async function downloadQrPng(svgString: string, filename: string) {
  return new Promise<void>((resolve, reject) => {
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const size = 768;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas not available"));
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        canvas.toBlob((b) => {
          if (!b) {
            reject(new Error("toBlob failed"));
            return;
          }
          const url = URL.createObjectURL(b);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          resolve();
        }, "image/png");
      };
      img.onerror = () => reject(new Error("svg → image failed"));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error("read svg failed"));
    reader.readAsDataURL(blob);
  });
}

export function QrPanel({ activationId, serviceName }: QrPanelProps) {
  const qr = useActivationQr(activationId);
  const stats = useActivationQrStats(activationId);
  const patch = usePatchActivationQr(activationId);
  const [editingDest, setEditingDest] = useState(false);
  const [destDraft, setDestDraft] = useState("");

  const isLoading = qr.isLoading;
  const isError = qr.isError;

  function startEditDestination() {
    setDestDraft("");
    setEditingDest(true);
  }

  async function saveDestination() {
    try {
      await patch.mutateAsync({ destinationUrl: destDraft.trim() || null });
      toast({ description: "Destination saved" });
      setEditingDest(false);
    } catch {
      // hook toast
    }
  }

  async function regenerate() {
    if (!window.confirm("Regenerating will invalidate any printed QR codes pointing at the old short code. Proceed?")) return;
    try {
      await patch.mutateAsync({ regenerate: true });
      toast({ description: "New QR code generated" });
    } catch {
      // hook toast
    }
  }

  async function copyUrl() {
    if (!qr.data?.scanUrl) return;
    try {
      await navigator.clipboard.writeText(qr.data.scanUrl);
      toast({ description: "Scan URL copied" });
    } catch {
      toast({ variant: "destructive", description: "Could not copy" });
    }
  }

  async function download() {
    if (!qr.data?.svg) return;
    try {
      await downloadQrPng(qr.data.svg, `activation-qr-${qr.data.shortCode}.png`);
      toast({ description: "QR downloaded" });
    } catch (err) {
      toast({ variant: "destructive", description: (err as Error).message || "Download failed" });
    }
  }

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1.5">
          <QrCode className="w-3.5 h-3.5" />
          QR code &amp; scan tracking
        </h4>
      </header>

      {isLoading && <Skeleton className="h-48 w-full" />}
      {isError && <p className="text-xs text-red-700">Couldn&apos;t load QR. Try reopening the panel.</p>}

      {qr.data && (
        <>
          <div className="rounded-md border border-border bg-card p-3 flex flex-col sm:flex-row gap-3 items-start">
            <div
              className="shrink-0 w-32 h-32 rounded-md border border-border bg-white p-1 flex items-center justify-center"
              dangerouslySetInnerHTML={{ __html: qr.data.svg }}
              aria-label={`QR code for ${serviceName}`}
              role="img"
            />
            <div className="flex-1 min-w-0 space-y-2 text-sm">
              <div>
                <div className="text-xs text-muted">Short URL</div>
                <a
                  href={qr.data.scanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-brand hover:underline break-all inline-flex items-center gap-1"
                >
                  {qr.data.scanUrl}
                  <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
                </a>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={copyUrl} iconLeft={<Copy className="w-3.5 h-3.5" />}>
                  Copy URL
                </Button>
                <Button size="sm" variant="secondary" onClick={download} iconLeft={<Download className="w-3.5 h-3.5" />}>
                  Download PNG
                </Button>
                <Button size="sm" variant="secondary" onClick={regenerate} iconLeft={<RefreshCw className="w-3.5 h-3.5" />} loading={patch.isPending}>
                  New code
                </Button>
              </div>
              <div className="text-[11px] text-muted">
                Print this QR on flyers or display it at the event. Scans are tracked anonymously
                (no raw IPs stored). Enquiries from the parent portal are auto-linked back via{" "}
                <code className="text-[10px]">utm_campaign</code>.
              </div>
            </div>
          </div>

          {/* Destination URL editor */}
          <div className="rounded-md border border-border p-3 text-sm">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-xs text-muted">Scan redirects to</div>
              {!editingDest && (
                <button onClick={startEditDestination} className="text-xs text-brand hover:underline">
                  {qr.data.scanUrl ? "Edit" : "Set"}
                </button>
              )}
            </div>
            {!editingDest ? (
              <p className="text-xs text-foreground break-all">
                Default: <em>parent enquiry page for {serviceName}</em> — set a custom destination to send scans
                to a specific landing page (booking form, programme info, holiday quest signup, etc.).
              </p>
            ) : (
              <div className="space-y-2">
                <input
                  type="url"
                  value={destDraft}
                  onChange={(e) => setDestDraft(e.target.value)}
                  placeholder="https://amanaoshc.company/parent/enquire?serviceId=…"
                  className="w-full rounded-md border border-border bg-card p-2 text-sm font-mono"
                />
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditingDest(false)}>Cancel</Button>
                  <Button size="sm" variant="primary" onClick={saveDestination} loading={patch.isPending}>Save</Button>
                </div>
                <p className="text-[10px] text-muted">
                  Leave blank to use the default. utm_source=qr, utm_medium=activation, utm_campaign={qr.data.shortCode} are appended automatically.
                </p>
              </div>
            )}
          </div>

          {/* Stats */}
          {stats.data && (
            <div className="grid grid-cols-4 gap-2 text-center">
              <Stat label="Scans" value={stats.data.totals.scans} />
              <Stat label="Unique" value={stats.data.totals.uniqueVisitors} />
              <Stat label="Enquiries" value={stats.data.totals.enquiries} />
              <Stat
                label="Convert"
                value={`${Math.round(stats.data.totals.conversionRate * 100)}%`}
              />
            </div>
          )}

          {/* Recent activity */}
          {stats.data && (stats.data.recentScans.length > 0 || stats.data.recentEnquiries.length > 0) && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted hover:text-foreground">
                Recent activity
              </summary>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="font-medium text-foreground mb-1">Last 10 scans</div>
                  {stats.data.recentScans.length === 0 ? (
                    <p className="text-muted">No scans yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {stats.data.recentScans.map((s) => (
                        <li key={s.id} className="rounded border border-border p-1.5">
                          <div className="text-foreground">{fmtDateTime(s.scannedAt)}</div>
                          <div className="text-[10px] text-muted">{shortenUserAgent(s.userAgent)}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="font-medium text-foreground mb-1">Linked enquiries</div>
                  {stats.data.recentEnquiries.length === 0 ? (
                    <p className="text-muted">No enquiries from this QR yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {stats.data.recentEnquiries.map((e) => (
                        <li key={e.id} className="rounded border border-border p-1.5">
                          <div className="text-foreground">{e.parentName}</div>
                          <div className="text-[10px] text-muted">
                            {fmtDateTime(e.createdAt)} · stage <span className="capitalize">{e.stage.replace(/_/g, " ")}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <div className="text-base font-semibold text-foreground">{value}</div>
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}
