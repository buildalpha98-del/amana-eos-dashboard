"use client";

/**
 * Publish forms for families to sign — permission slips, policy
 * acknowledgements, excursion consents.
 *
 * Lives in Service Information because it's parent-facing content, like
 * everything else on this tab. Families sign in their portal (My Centre
 * → Documents) with a typed full name; the signature count here tells
 * staff who they're still waiting on.
 *
 * There is deliberately no delete: a signed form is a record of consent,
 * and archiving hides it while keeping every signature.
 */

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  FileSignature,
  FileText,
  Loader2,
  Plus,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/hooks/useToast";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

interface FormRow {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  fileName: string | null;
  dueDate: string | null;
  status: string;
  createdAt: string;
  signatureCount: number;
}

const field =
  "w-full px-3 py-2.5 border border-border rounded-lg text-base sm:text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand/30";

export function ParentFormsCard({
  serviceId,
  canEdit,
}: {
  serviceId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [perChild, setPerChild] = useState(false);

  const { data } = useQuery<{ forms: FormRow[] }>({
    queryKey: ["service", serviceId, "parent-forms"],
    queryFn: () => fetchApi(`/api/services/${serviceId}/parent-forms`),
    retry: 1,
  });
  const forms = data?.forms ?? [];

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mutateApi(`/api/services/${serviceId}/parent-forms`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service", serviceId, "parent-forms"] });
      setCreating(false);
      setTitle("");
      setDescription("");
      setDueDate("");
      setFileUrl("");
      setFileName("");
      setPerChild(false);
      toast({
        description: "Form published — families have been notified.",
      });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  const archive = useMutation({
    mutationFn: (formId: string) =>
      mutateApi(`/api/services/${serviceId}/parent-forms/${formId}`, {
        method: "PATCH",
        body: { status: "archived" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["service", serviceId, "parent-forms"] });
      toast({ description: "Form archived. Signatures are kept." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/content-uploads", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Upload failed (${res.status})`);
      }
      const body = (await res.json()) as { url: string };
      setFileUrl(body.url);
      setFileName(file.name);
    } catch (err) {
      toast({
        variant: "destructive",
        description: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setUploading(false);
    }
  }

  const active = forms.filter((f) => f.status === "active");
  const archived = forms.filter((f) => f.status !== "active");

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <FileSignature className="h-4 w-4 text-brand" />
            Forms for families to sign
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Permission slips and acknowledgements. Families sign in their
            portal with a typed full name; you see who&apos;s signed here.
          </p>
        </div>
        {canEdit && !creating && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="h-3 w-3" /> New form
          </Button>
        )}
      </div>

      {creating && (
        <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
          <div>
            <label
              htmlFor="pf-title"
              className="block text-sm font-medium text-foreground mb-1"
            >
              What are they signing?
            </label>
            <input
              id="pf-title"
              className={field}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Term 4 excursion consent"
            />
          </div>
          <div>
            <label
              htmlFor="pf-desc"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Details <span className="text-muted">(optional)</span>
            </label>
            <textarea
              id="pf-desc"
              className={field}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What it covers, in a sentence or two."
            />
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={perChild}
              onChange={(e) => setPerChild(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-brand"
            />
            <span className="text-sm text-foreground">
              One signature per child
              <span className="block text-xs text-muted">
                For CWAs, medical consents — anything where signing for one
                child says nothing about their sibling. Off: one signature
                covers the family (a DDR, a general policy).
              </span>
            </span>
          </label>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="pf-due"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Needed by <span className="text-muted">(optional)</span>
              </label>
              <input
                id="pf-due"
                type="date"
                className={field}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-40">
              {fileUrl ? (
                <p className="text-sm text-foreground flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-muted" />
                  {fileName || "Attached"}
                  <button
                    type="button"
                    onClick={() => {
                      setFileUrl("");
                      setFileName("");
                    }}
                    className="text-xs text-muted underline underline-offset-2 ml-1"
                  >
                    remove
                  </button>
                </p>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                  Attach the document
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void handleUpload(f);
                }}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              onClick={() =>
                create.mutate({
                  title: title.trim(),
                  perChild,
                  ...(description.trim() ? { description: description.trim() } : {}),
                  ...(dueDate ? { dueDate } : {}),
                  ...(fileUrl ? { fileUrl, fileName } : {}),
                })
              }
              disabled={create.isPending || title.trim().length === 0}
            >
              {create.isPending ? "Publishing…" : "Publish to families"}
            </Button>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {active.length === 0 && !creating ? (
        <p className="text-sm text-muted">No forms waiting on signatures.</p>
      ) : (
        <ul className="divide-y divide-border">
          {active.map((f) => (
            <li key={f.id} className="py-2.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {f.title}
                </p>
                <p className="text-xs text-muted">
                  {f.signatureCount}{" "}
                  {f.signatureCount === 1 ? "family has" : "families have"}{" "}
                  signed
                  {f.dueDate &&
                    ` · needed by ${new Date(f.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`}
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => archive.mutate(f.id)}
                  aria-label={`Archive ${f.title}`}
                  className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface min-h-11 min-w-11"
                >
                  <Archive className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <p className="text-xs text-muted">
          {archived.length} archived — signatures kept.
        </p>
      )}
    </div>
  );
}
