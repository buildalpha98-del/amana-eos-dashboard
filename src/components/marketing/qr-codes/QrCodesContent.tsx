"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/Button";
import { useQrCodes, type QrCodeRow } from "@/hooks/useQrCodes";
import { CreateQrModal } from "./CreateQrModal";
import { QrDetailPanel } from "./QrDetailPanel";
import { Plus, Filter, ExternalLink, QrCode } from "lucide-react";

const FILTERS = [
  { value: "true", label: "Active" },
  { value: "false", label: "Archived" },
  { value: "all", label: "All" },
] as const;

export default function QrCodesContent() {
  const sp = useSearchParams();
  const initialId = sp.get("id");
  const initialActivationId = sp.get("activationId") ?? undefined;
  const [filter, setFilter] = useState<"true" | "false" | "all">("true");
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error, refetch } = useQrCodes({
    active: filter,
    activationId: initialActivationId,
    search: search.trim() || undefined,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialId);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <PageHeader
        title="QR Hub"
        description="Create, manage and track every QR code. Each one has its own short URL, scan log, and unique-visitor count."
        primaryAction={{
          label: "New QR code",
          icon: Plus,
          onClick: () => setCreateOpen(true),
        }}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-muted" aria-hidden />
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-2.5 py-1 rounded-full border text-xs ${
              filter === f.value ? "bg-brand text-white border-brand" : "bg-card text-muted border-border hover:text-foreground"
            }`}
            aria-pressed={filter === f.value}
          >
            {f.label}
          </button>
        ))}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or short code…"
          className="ml-auto w-64 rounded-md border border-border bg-card p-1.5 text-xs"
        />
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {isError && (
        <ErrorState title="Couldn't load QR codes" error={error ?? undefined} onRetry={() => refetch()} />
      )}

      {data && data.codes.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
          <QrCode className="w-8 h-8 mx-auto mb-2 text-muted/60" />
          <p className="font-medium text-foreground">No QR codes yet.</p>
          <p>Click <strong>New QR code</strong> to create your first one.</p>
        </div>
      )}

      {data && data.codes.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs text-muted">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Short URL</th>
                <th className="text-left p-3 font-medium">Destination</th>
                <th className="text-right p-3 font-medium">Unique</th>
                <th className="text-right p-3 font-medium">Total scans</th>
                <th className="text-left p-3 font-medium">Linked</th>
              </tr>
            </thead>
            <tbody>
              {data.codes.map((c: QrCodeRow) => (
                <tr
                  key={c.id}
                  className={`border-t border-border hover:bg-surface/50 cursor-pointer ${!c.active ? "opacity-60" : ""}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <td className="p-3">
                    <div className="font-medium text-foreground">{c.name}</div>
                    {c.description && <div className="text-xs text-muted line-clamp-1">{c.description}</div>}
                    {!c.active && <div className="text-[10px] text-muted">archived</div>}
                  </td>
                  <td className="p-3 text-xs font-mono text-foreground">
                    <a
                      href={c.scanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-brand hover:underline inline-flex items-center gap-1"
                      title={c.scanUrl}
                    >
                      /a/{c.shortCode}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="p-3 text-xs text-muted truncate max-w-[200px]" title={c.destinationUrl}>
                    {c.destinationUrl.replace(/^https?:\/\//, "")}
                  </td>
                  <td className="p-3 text-right text-base font-semibold text-foreground">{c.totals.uniqueVisitors}</td>
                  <td className="p-3 text-right text-foreground">{c.totals.scans}</td>
                  <td className="p-3 text-xs">
                    {c.activation && <div className="text-foreground">{c.activation.label}</div>}
                    {!c.activation && c.service && <div className="text-foreground">{c.service.name}</div>}
                    {!c.activation && !c.service && <span className="text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateQrModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => setSelectedId(id)}
      />
      <QrDetailPanel qrId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
