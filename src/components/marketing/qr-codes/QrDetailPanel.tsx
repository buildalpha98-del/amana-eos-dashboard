"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  useQrCodeDetail,
  usePatchQrCode,
  useArchiveQrCode,
} from "@/hooks/useQrCodes";
import { toast } from "@/hooks/useToast";
import { Copy, Download, RefreshCw, ExternalLink, Archive, Pencil, MapPin, Globe } from "lucide-react";

interface QrDetailPanelProps {
  qrId: string | null;
  onClose: () => void;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function deviceFromUa(ua: string | null): string {
  if (!ua) return "—";
  if (ua.includes("iPhone")) return "iPhone";
  if (ua.includes("iPad")) return "iPad";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("Mac")) return "Mac";
  if (ua.includes("Windows")) return "Windows";
  return ua.slice(0, 32);
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

export function QrDetailPanel({ qrId, onClose }: QrDetailPanelProps) {
  const { data, isLoading, isError, error } = useQrCodeDetail(qrId);
  const patch = usePatchQrCode();
  const archive = useArchiveQrCode();
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [destDraft, setDestDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");

  function startEdit() {
    if (!data) return;
    setNameDraft(data.name);
    setDestDraft(data.destinationUrl);
    setDescDraft(data.description ?? "");
    setEditing(true);
  }

  async function saveEdit() {
    if (!data) return;
    try {
      await patch.mutateAsync({
        id: data.id,
        name: nameDraft.trim(),
        destinationUrl: destDraft.trim(),
        description: descDraft.trim() || null,
      });
      toast({ description: "Saved" });
      setEditing(false);
    } catch {
      // hook toast
    }
  }

  async function regenerate() {
    if (!data) return;
    if (!window.confirm("Regenerate the short code? Old printed QRs will redirect to the fallback page.")) return;
    try {
      await patch.mutateAsync({ id: data.id, regenerate: true });
      toast({ description: "Short code rotated" });
    } catch {
      // hook toast
    }
  }

  async function doArchive() {
    if (!data) return;
    if (!window.confirm("Archive this QR? Old scans still resolve (to the fallback) so printed flyers don't 404.")) return;
    try {
      await archive.mutateAsync(data.id);
      toast({ description: "Archived" });
      onClose();
    } catch {
      // hook toast
    }
  }

  async function copyUrl() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.scanUrl);
      toast({ description: "Scan URL copied" });
    } catch {
      toast({ variant: "destructive", description: "Could not copy" });
    }
  }

  async function download() {
    if (!data) return;
    try {
      await downloadQrPng(data.svg, `qr-${data.shortCode}.png`);
      toast({ description: "QR downloaded" });
    } catch (err) {
      toast({ variant: "destructive", description: (err as Error).message || "Download failed" });
    }
  }

  return (
    <Sheet open={!!qrId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent width="max-w-2xl" className="p-6 overflow-y-auto">
        {isLoading && <Skeleton className="h-64 w-full" />}
        {isError && <p className="text-sm text-red-700">Couldn&apos;t load: {error?.message}</p>}
        {data && (
          <>
            <SheetTitle className="text-base font-semibold pr-8">{data.name}</SheetTitle>
            <SheetDescription className="text-xs text-muted">
              Created {fmtDateTime(data.createdAt)}{data.createdBy ? ` by ${data.createdBy.name}` : ""}
              {!data.active && " · archived"}
            </SheetDescription>

            <div className="mt-5 space-y-5">
              {/* QR + actions */}
              <div className="rounded-md border border-border bg-card p-3 flex gap-3 items-start">
                <div
                  className="shrink-0 w-28 h-28 rounded border border-border bg-white p-0.5 [&_svg]:w-full [&_svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: data.svg }}
                  aria-label={`QR code for ${data.name}`}
                  role="img"
                />
                <div className="flex-1 min-w-0 space-y-2 text-sm">
                  <div className="min-w-0">
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Scan URL</div>
                    <a
                      href={data.scanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={data.scanUrl}
                      className="font-mono text-xs text-brand hover:underline flex items-center gap-1 min-w-0"
                    >
                      <span className="truncate">{data.scanUrl.replace(/^https?:\/\//, "")}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
                    </a>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="secondary" onClick={copyUrl} iconLeft={<Copy className="w-3.5 h-3.5" />} className="text-xs">Copy</Button>
                    <Button size="sm" variant="secondary" onClick={download} iconLeft={<Download className="w-3.5 h-3.5" />} className="text-xs">PNG</Button>
                    <Button size="sm" variant="secondary" onClick={regenerate} iconLeft={<RefreshCw className="w-3.5 h-3.5" />} loading={patch.isPending} className="text-xs">Rotate</Button>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Total scans" value={data.totals.scans} />
                <Stat label="Unique visitors" value={data.totals.uniqueVisitors} highlight />
                <Stat label="Status" value={data.active ? "Active" : "Archived"} />
              </div>

              {/* Editable fields */}
              <section className="rounded-md border border-border p-3 text-sm">
                <header className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-muted uppercase tracking-wide">Details</h4>
                  {!editing && (
                    <Button size="sm" variant="secondary" iconLeft={<Pencil className="w-3.5 h-3.5" />} onClick={startEdit}>
                      Edit
                    </Button>
                  )}
                </header>
                {!editing ? (
                  <dl className="space-y-2 text-sm">
                    <DataRow label="Destination">
                      <a href={data.destinationUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline break-all">
                        {data.destinationUrl}
                      </a>
                    </DataRow>
                    {data.description && <DataRow label="Notes">{data.description}</DataRow>}
                    {data.activation && <DataRow label="Activation">{data.activation.label}</DataRow>}
                    {data.service && <DataRow label="Centre">{data.service.name}</DataRow>}
                  </dl>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-xs">
                      <span className="text-muted">Name</span>
                      <input type="text" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-1.5 text-sm" />
                    </label>
                    <label className="block text-xs">
                      <span className="text-muted">Destination URL</span>
                      <input type="url" value={destDraft} onChange={(e) => setDestDraft(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-card p-1.5 text-sm font-mono" />
                    </label>
                    <label className="block text-xs">
                      <span className="text-muted">Notes</span>
                      <textarea value={descDraft} onChange={(e) => setDescDraft(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-border bg-card p-1.5 text-sm" />
                    </label>
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
                      <Button size="sm" variant="primary" onClick={saveEdit} loading={patch.isPending}>Save</Button>
                    </div>
                  </div>
                )}
              </section>

              {/* Locations */}
              {data.topLocations.length > 0 && (
                <section className="rounded-md border border-border p-3 text-sm">
                  <header className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      Top scan locations
                    </h4>
                  </header>
                  <ul className="space-y-1">
                    {data.topLocations.map((loc) => (
                      <li key={loc.location} className="flex items-center justify-between text-xs">
                        <span className="text-foreground truncate">{loc.location}</span>
                        <span className="text-muted">{loc.count} scan{loc.count === 1 ? "" : "s"}</span>
                      </li>
                    ))}
                  </ul>
                  {data.countryCounts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                      {data.countryCounts.map((c) => (
                        <span key={c.country} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-surface">
                          <Globe className="w-2.5 h-2.5" />
                          {c.country} · {c.count}
                        </span>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Recent scans */}
              <section className="rounded-md border border-border p-3 text-sm">
                <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                  Recent scans ({data.recentScans.length})
                </h4>
                {data.recentScans.length === 0 ? (
                  <p className="text-xs text-muted">No scans yet. Print the QR and put it somewhere people can see it.</p>
                ) : (
                  <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                    {data.recentScans.map((s) => (
                      <li key={s.id} className="rounded border border-border p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">{fmtDateTime(s.scannedAt)}</span>
                          <span className="text-muted">{deviceFromUa(s.userAgent)}</span>
                        </div>
                        {(s.city || s.region || s.country) && (
                          <div className="text-[10px] text-muted mt-0.5">
                            {[s.city, s.region, s.country].filter(Boolean).join(", ")}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Archive */}
              {data.active && (
                <div>
                  <Button size="sm" variant="secondary" onClick={doArchive} iconLeft={<Archive className="w-3.5 h-3.5" />}>
                    Archive QR
                  </Button>
                  <p className="text-[11px] text-muted mt-1">
                    Archived QRs still resolve scans (so printed flyers keep redirecting to the fallback enquiry page),
                    but they&apos;re hidden from the default Hub view.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${highlight ? "border-brand/40 bg-brand/5" : "border-border bg-card"}`}>
      <div className="text-base font-semibold text-foreground">{value}</div>
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
    </div>
  );
}

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] text-muted uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}
