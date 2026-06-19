"use client";

/**
 * Upload a .docx file as a document-mode audit template.
 *
 * Two-step flow matching the AI knowledge / contracts pattern:
 *   1. Client uploads bytes to Vercel Blob via @vercel/blob/client.upload()
 *   2. Client POSTs /api/audits/templates with the blob URL + metadata,
 *      which creates the AuditTemplate row with documentMode=true.
 *
 * No question parsing — coordinators will edit the DOCX inline on each
 * per-service instance once the editor (phase 4) ships.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, Upload } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";

const FREQUENCY_TO_DEFAULT_MONTHS: Record<string, number[]> = {
  monthly: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  half_yearly: [1, 7],
  yearly: [1],
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function UploadDocumentAuditModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [qualityArea, setQualityArea] = useState<number>(2);
  const [nqsReference, setNqsReference] = useState("");
  const [frequency, setFrequency] = useState<"monthly" | "half_yearly" | "yearly">("yearly");

  const submit = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Pick a .docx file first.");
      if (!name.trim()) throw new Error("Give the audit a name.");
      if (!nqsReference.trim()) throw new Error("NQS reference is required.");

      // 1. Push bytes to Vercel Blob direct from the browser.
      const { upload } = await import("@vercel/blob/client");
      const blob = await upload(`audits/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/audits/templates/upload",
        contentType:
          file.type ||
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      // 2. Create the template row with sourceFileUrl + documentMode=true.
      const created = await mutateApi<{ id: string; name: string }>(
        "/api/audits/templates",
        {
          method: "POST",
          body: {
            name: name.trim(),
            description: description.trim() || undefined,
            qualityArea,
            nqsReference: nqsReference.trim(),
            frequency,
            scheduledMonths: FREQUENCY_TO_DEFAULT_MONTHS[frequency],
            sourceFileUrl: blob.url,
            documentMode: true,
            sourceFileName: file.name,
          },
        },
      );
      return created;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["audit-templates"] });
      toast({
        description: `Audit "${data.name}" added. Click "Apply to services" to schedule it across centres.`,
      });
      onClose();
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", description: err.message }),
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg sm:mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-base font-semibold text-foreground">
            Upload Document Audit
          </h3>
          <button onClick={onClose} className="p-1 rounded-md text-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="rounded-md border border-blue-200 bg-blue-50/40 p-3 text-xs text-blue-900">
            Document audits: upload a .docx, set the cadence, then apply to every
            centre. Each centre gets its own scheduled instance — when a
            coordinator completes one, the inline editor saves their filled-in
            version per service.
          </div>

          <div>
            <label className="text-xs font-medium text-muted block mb-1">
              .docx file
            </label>
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !name) {
                  // Pre-fill name from filename minus extension.
                  setName(f.name.replace(/\.docx?$/i, ""));
                }
              }}
              className="w-full text-sm"
            />
            {file && (
              <p className="text-xs text-muted mt-1">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted block mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Annual WHS Audit"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted block mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted block mb-1">
                Quality Area
              </label>
              <select
                value={qualityArea}
                onChange={(e) => setQualityArea(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg"
              >
                <option value={1}>QA1 — Educational program</option>
                <option value={2}>QA2 — Health & safety</option>
                <option value={3}>QA3 — Physical environment</option>
                <option value={4}>QA4 — Staffing</option>
                <option value={5}>QA5 — Relationships</option>
                <option value={6}>QA6 — Partnerships</option>
                <option value={7}>QA7 — Governance</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted block mb-1">
                NQS Reference
              </label>
              <input
                type="text"
                value={nqsReference}
                onChange={(e) => setNqsReference(e.target.value)}
                placeholder="e.g. 2.2.1"
                className="w-full px-3 py-2 text-sm border border-border rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted block mb-1">
              Cadence
            </label>
            <select
              value={frequency}
              onChange={(e) =>
                setFrequency(e.target.value as "monthly" | "half_yearly" | "yearly")
              }
              className="w-full px-3 py-2 text-sm border border-border rounded-lg"
            >
              <option value="monthly">Monthly (every month)</option>
              <option value="half_yearly">Half-yearly (Jan + Jul)</option>
              <option value="yearly">Yearly (Jan)</option>
            </select>
            <p className="text-xs text-muted mt-1">
              Each service gets an instance scheduled on these months. You can fine-
              tune the schedule after upload via the existing Apply-to-Services
              modal.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => submit.mutate()}
            disabled={!file || !name.trim() || !nqsReference.trim() || submit.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand/90 disabled:opacity-50"
          >
            {submit.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {submit.isPending ? "Uploading…" : "Upload + create template"}
          </button>
        </div>
      </div>
    </div>
  );
}
