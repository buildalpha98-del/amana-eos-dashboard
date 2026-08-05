"use client";

import { useRef, useState } from "react";
import type { CreativeRequestType } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import {
  TURNAROUND_BUSINESS_DAYS,
  TYPE_LABELS,
  defaultDueDate,
} from "@/lib/creative-request/constants";
import {
  useCreateRequest,
  type AttachmentInput,
} from "@/hooks/useCreativeRequests";
import { useServices } from "@/hooks/useServices";

const TYPE_ICONS: Record<CreativeRequestType, string> = {
  flyer: "📄",
  poster: "🖼️",
  social_tile: "📱",
  table_cover: "🪑",
  banner_signage: "🚩",
  email_header: "✉️",
  merch: "👕",
  other: "✨",
};

const TYPES = Object.keys(TYPE_LABELS) as CreativeRequestType[];

export function NewRequestModal({ onClose }: { onClose: () => void }) {
  const createRequest = useCreateRequest();
  const { data: servicesData } = useServices();
  const fileInput = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<CreativeRequestType | null>(null);
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [exactCopy, setExactCopy] = useState("");
  const [sizeSpec, setSizeSpec] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [attachments, setAttachments] = useState<AttachmentInput[]>([]);
  const [uploading, setUploading] = useState(false);

  const minDue = type
    ? defaultDueDate(type).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(err?.error || "Upload failed");
        }
        const json = (await res.json()) as {
          fileName: string;
          fileUrl: string;
          fileSize: number;
          mimeType: string;
        };
        setAttachments((prev) => [...prev, json]);
      }
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error && err.message !== "Upload failed"
          ? err.message
          : "File upload failed — try again",
      });
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (!type || !title.trim() || !purpose.trim()) {
      toast({ variant: "destructive", description: "Pick a type and fill in the title and purpose" });
      return;
    }
    createRequest.mutate(
      {
        type,
        title: title.trim(),
        purpose: purpose.trim(),
        exactCopy: exactCopy.trim() || undefined,
        sizeSpec: sizeSpec.trim() || undefined,
        serviceId: serviceId || undefined,
        dueDate: dueDate || undefined,
        attachments,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="New creative request">
      <div className="bg-card w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-xl sm:rounded-xl border border-border p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-heading font-semibold tracking-tight text-foreground">
              New request
            </h2>
            <p className="text-sm text-muted mt-1">
              Pick what you need — the turnaround and brief fields follow.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-lg border p-3 text-center transition-colors ${
                type === t
                  ? "border-brand bg-brand/5 ring-1 ring-brand"
                  : "border-border bg-card hover:border-brand-light"
              }`}
            >
              <span className="text-xl block">{TYPE_ICONS[t]}</span>
              <span className="text-xs font-semibold text-foreground block mt-1">
                {TYPE_LABELS[t]}
              </span>
              <span className="text-2xs text-muted block mt-0.5">
                {TURNAROUND_BUSINESS_DAYS[t]} business days
              </span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
          <label className="text-xs font-semibold text-foreground sm:col-span-2">
            Title *
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Table cover for school expo stall"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs font-semibold text-foreground">
            Your centre
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            >
              <option value="">— Head office / all —</option>
              {(servicesData ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-foreground">
            Needed by
            <input
              type="date"
              value={dueDate}
              min={minDue}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
            <span className="text-2xs text-muted font-normal">
              Leave blank for the standard turnaround
            </span>
          </label>
          <label className="text-xs font-semibold text-foreground sm:col-span-2">
            What&apos;s it for? *
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              placeholder="Where will it be used, who's the audience, any context…"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs font-semibold text-foreground sm:col-span-2">
            Exact copy <span className="text-muted font-normal">— we&apos;ll paste this verbatim</span>
            <textarea
              value={exactCopy}
              onChange={(e) => setExactCopy(e.target.value)}
              rows={2}
              placeholder="The exact wording that should appear on the design"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs font-semibold text-foreground">
            Size / dimensions
            <input
              value={sizeSpec}
              onChange={(e) => setSizeSpec(e.target.value)}
              placeholder="e.g. A3, 6ft trestle, 1080×1350"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
            />
          </label>
          <div className="text-xs font-semibold text-foreground">
            Reference files
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <div className="mt-1">
              <Button
                variant="outline"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                {uploading ? "Uploading…" : "Add files"}
              </Button>
            </div>
            {attachments.map((a) => (
              <div key={a.fileUrl} className="text-2xs text-muted mt-1 truncate">
                📎 {a.fileName}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={createRequest.isPending}>
            {createRequest.isPending ? "Submitting…" : "Submit request"}
          </Button>
        </div>
      </div>
    </div>
  );
}
