"use client";

/**
 * Upload a .docx as a document-mode audit template.
 *
 * Flow:
 *   1. Client uploads bytes to Vercel Blob via @vercel/blob/client.upload()
 *   2. Client POSTs /api/audits/templates with the blob URL + metadata
 *
 * 2026-06-19 simplified: dropped QA picker + NQS reference (audits
 * span multiple QAs and we default to QA2 server-side). Cadence
 * picker now covers daily/weekly/monthly/quarterly/half_yearly/yearly
 * and the schedule anchors to the current month — so a yearly audit
 * uploaded in June schedules for June each year, not January.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, Upload } from "lucide-react";
import { toast } from "@/hooks/useToast";
import { mutateApi } from "@/lib/fetch-api";

type Frequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "yearly";

/**
 * Build the scheduledMonths array for a template, anchored to the
 * month it's being uploaded in. Daniel's services close over the
 * Jan/Jul school-holiday windows so the legacy Jan/Jul anchors
 * created instances during shutdowns — anchor at the upload month
 * instead.
 */
function computeScheduledMonths(freq: Frequency, anchorMonth: number): number[] {
  const wrap = (m: number) => ((m - 1) % 12) + 1;
  switch (freq) {
    case "yearly":
      return [anchorMonth];
    case "half_yearly":
      return [anchorMonth, wrap(anchorMonth + 6)].sort((a, b) => a - b);
    case "quarterly":
      return [
        anchorMonth,
        wrap(anchorMonth + 3),
        wrap(anchorMonth + 6),
        wrap(anchorMonth + 9),
      ].sort((a, b) => a - b);
    // For monthly + daily + weekly, every month is scheduled — the
    // sub-month cadence is handled by the scheduler cron, not by
    // picking specific months here.
    case "monthly":
    case "daily":
    case "weekly":
    default:
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function UploadDocumentAuditModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("yearly");

  const submit = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Pick a .docx file first.");
      if (!name.trim()) throw new Error("Give the audit a name.");

      const { upload } = await import("@vercel/blob/client");
      const blob = await upload(`audits/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/audits/templates/upload",
        contentType:
          file.type ||
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const anchorMonth = new Date().getMonth() + 1;
      const scheduledMonths = computeScheduledMonths(frequency, anchorMonth);

      return mutateApi<{ id: string; name: string }>(
        "/api/audits/templates",
        {
          method: "POST",
          body: {
            name: name.trim(),
            description: description.trim() || undefined,
            frequency,
            scheduledMonths,
            sourceFileUrl: blob.url,
            documentMode: true,
            sourceFileName: file.name,
          },
        },
      );
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["audit-templates"] });
      toast({
        description: `Audit "${data.name}" added. Click "Apply to services" on the row to schedule it across centres.`,
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
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="rounded-md border border-blue-200 bg-blue-50/40 p-3 text-xs text-blue-900 space-y-1.5">
            <p>
              The .docx becomes the master template — it stays untouched and
              is downloadable from the template row.
            </p>
            <p>
              Click "Apply to services" next, and each centre gets its own
              scheduled instance from this month forward (no backdating). When
              a coordinator opens an instance, the document loads in an inline
              editor — what they save is stored on that instance only, so the
              master template keeps cycling for the next period.
            </p>
            <p>
              Cadence anchors to today's month — a yearly audit uploaded in
              June runs every June.
            </p>
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
            <label className="text-xs font-medium text-muted block mb-1">
              Name
            </label>
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

          <div>
            <label className="text-xs font-medium text-muted block mb-1">
              Cadence
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="half_yearly">Half-yearly</option>
              <option value="yearly">Yearly</option>
            </select>
            <p className="text-xs text-muted mt-1">
              Each centre gets an instance scheduled at this cadence starting
              from the month you upload.
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
            disabled={!file || !name.trim() || submit.isPending}
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
