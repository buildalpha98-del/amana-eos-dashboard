"use client";

import { useState, useMemo } from "react";
import {
  Plus,
  Upload,
  Pencil,
  Archive,
  Users,
  FileText,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/Dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  usePolicies,
  useCreatePolicy,
  useUpdatePolicy,
  useUploadPolicyVersion,
  useArchivePolicy,
  usePolicyAcknowledgements,
  type PolicyDocumentListItem,
} from "@/hooks/usePolicies";
import type { PolicyDocumentCategory } from "@prisma/client";

// ─── Constants ───────────────────────────────────────────────

const CATEGORY_OPTIONS: { value: PolicyDocumentCategory; label: string }[] = [
  { value: "policy", label: "Policies" },
  { value: "procedure", label: "Procedures" },
  { value: "other", label: "Other" },
];

function categoryLabel(c: PolicyDocumentCategory) {
  return CATEGORY_OPTIONS.find((o) => o.value === c)?.label ?? c;
}

function formatDate(iso: string | Date | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Library list — admin view
// ═══════════════════════════════════════════════════════════════════════════

export function PolicyAdminPanel() {
  const [showArchived, setShowArchived] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<PolicyDocumentCategory | "all">("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<PolicyDocumentListItem | null>(null);
  const [versioningDoc, setVersioningDoc] = useState<PolicyDocumentListItem | null>(null);
  const [acksDoc, setAcksDoc] = useState<PolicyDocumentListItem | null>(null);
  const [archivingDoc, setArchivingDoc] = useState<PolicyDocumentListItem | null>(null);

  const { data: docs, isLoading } = usePolicies({
    category: categoryFilter === "all" ? undefined : categoryFilter,
    includeArchived: showArchived,
  });

  const visible = useMemo(() => {
    if (!docs) return [];
    return docs;
  }, [docs]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as PolicyDocumentCategory | "all")}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm min-h-[40px]"
          >
            <option value="all">All categories</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded"
            />
            Show archived
          </label>
        </div>
        <Button
          variant="primary"
          size="md"
          iconLeft={<Plus className="w-4 h-4" />}
          onClick={() => setUploadOpen(true)}
        >
          New document
        </Button>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No documents yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload your first policy or procedure PDF to get started.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {visible.map((d) => (
            <DocumentRow
              key={d.id}
              doc={d}
              onUploadVersion={() => setVersioningDoc(d)}
              onEdit={() => setEditingDoc(d)}
              onArchive={() => setArchivingDoc(d)}
              onViewAcks={() => setAcksDoc(d)}
            />
          ))}
        </ul>
      )}

      {uploadOpen && <UploadDocumentDialog onClose={() => setUploadOpen(false)} />}
      {editingDoc && (
        <EditDocumentDialog doc={editingDoc} onClose={() => setEditingDoc(null)} />
      )}
      {versioningDoc && (
        <UploadVersionDialog doc={versioningDoc} onClose={() => setVersioningDoc(null)} />
      )}
      {acksDoc && (
        <AcknowledgementsDialog doc={acksDoc} onClose={() => setAcksDoc(null)} />
      )}
      {archivingDoc && (
        <ArchiveConfirm doc={archivingDoc} onClose={() => setArchivingDoc(null)} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Row
// ═══════════════════════════════════════════════════════════════════════════

function DocumentRow({
  doc,
  onUploadVersion,
  onEdit,
  onArchive,
  onViewAcks,
}: {
  doc: PolicyDocumentListItem;
  onUploadVersion: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onViewAcks: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground truncate">
            {doc.title}
          </span>
          {doc.isArchived && (
            <span className="text-[10px] uppercase tracking-wide font-medium text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">
              archived
            </span>
          )}
          <span className="text-[10px] uppercase tracking-wide font-medium text-muted bg-muted/50 px-1.5 py-0.5 rounded">
            {categoryLabel(doc.category)}
          </span>
          {doc.currentVersion ? (
            <span className="text-[10px] uppercase tracking-wide font-medium text-brand bg-brand/10 px-1.5 py-0.5 rounded">
              v{doc.currentVersion.versionNumber}
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wide font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
              no file
            </span>
          )}
        </div>
        {doc.description && (
          <p className="mt-1 text-xs text-muted line-clamp-2">{doc.description}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Updated {formatDate(doc.updatedAt)}
          {doc.currentVersion?.uploadedBy
            ? ` · v${doc.currentVersion.versionNumber} by ${doc.currentVersion.uploadedBy.name}`
            : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Upload className="w-3.5 h-3.5" />}
          onClick={onUploadVersion}
          disabled={doc.isArchived}
        >
          Upload new version
        </Button>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Pencil className="w-3.5 h-3.5" />}
          onClick={onEdit}
        >
          Edit details
        </Button>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Users className="w-3.5 h-3.5" />}
          onClick={onViewAcks}
        >
          View acknowledgements
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<Archive className="w-3.5 h-3.5" />}
          onClick={onArchive}
        >
          {doc.isArchived ? "Unarchive" : "Archive"}
        </Button>
      </div>
    </li>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Upload (create) dialog
// ═══════════════════════════════════════════════════════════════════════════

function UploadDocumentDialog({ onClose }: { onClose: () => void }) {
  const create = useCreatePolicy();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<PolicyDocumentCategory>("policy");
  const [file, setFile] = useState<File | null>(null);

  const valid = title.trim().length > 0 && !!file;

  async function submit() {
    if (!valid || !file) return;
    try {
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        file,
      });
      onClose();
    } catch {
      /* toast already fired */
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="lg">
        <DialogTitle className="text-base font-semibold mb-3">
          New policy document
        </DialogTitle>
        <div className="space-y-3">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="e.g. Child Safe Environment Policy"
              className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm min-h-[44px]"
              autoFocus
            />
          </Field>
          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="One-line summary shown in the library and on the staff list."
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PolicyDocumentCategory)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm min-h-[44px]"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="PDF file">
            <PdfFileInput value={file} onChange={setFile} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={create.isPending}
              className="min-h-[44px] px-4 py-2 text-sm font-medium text-muted"
            >
              Cancel
            </button>
            <Button
              variant="primary"
              size="md"
              onClick={submit}
              disabled={!valid || create.isPending}
              loading={create.isPending}
            >
              Upload
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Upload-new-version dialog
// ═══════════════════════════════════════════════════════════════════════════

function UploadVersionDialog({ doc, onClose }: { doc: PolicyDocumentListItem; onClose: () => void }) {
  const upload = useUploadPolicyVersion(doc.id);
  const [file, setFile] = useState<File | null>(null);

  async function submit() {
    if (!file) return;
    try {
      await upload.mutateAsync(file);
      onClose();
    } catch {
      /* toast already fired */
    }
  }

  const nextVersionLabel = doc.currentVersion ? `v${doc.currentVersion.versionNumber + 1}` : "v1";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="lg">
        <DialogTitle className="text-base font-semibold mb-1">
          Upload new version of {doc.title}
        </DialogTitle>
        <p className="text-xs text-muted mb-3">
          The new file will become <strong>{nextVersionLabel}</strong>. All staff
          will be required to re-acknowledge this document.
        </p>
        <PdfFileInput value={file} onChange={setFile} />
        <div className="flex justify-end gap-2 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={upload.isPending}
            className="min-h-[44px] px-4 py-2 text-sm font-medium text-muted"
          >
            Cancel
          </button>
          <Button
            variant="primary"
            size="md"
            onClick={submit}
            disabled={!file || upload.isPending}
            loading={upload.isPending}
          >
            Upload version
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Edit details dialog
// ═══════════════════════════════════════════════════════════════════════════

function EditDocumentDialog({ doc, onClose }: { doc: PolicyDocumentListItem; onClose: () => void }) {
  const update = useUpdatePolicy();
  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description ?? "");
  const [category, setCategory] = useState<PolicyDocumentCategory>(doc.category);

  const dirty =
    title.trim() !== doc.title ||
    (description.trim() || null) !== doc.description ||
    category !== doc.category;
  const valid = title.trim().length > 0 && dirty;

  async function submit() {
    if (!valid) return;
    try {
      await update.mutateAsync({
        id: doc.id,
        title: title.trim() !== doc.title ? title.trim() : undefined,
        description:
          (description.trim() || null) !== doc.description
            ? description.trim() || null
            : undefined,
        category: category !== doc.category ? category : undefined,
      });
      onClose();
    } catch {
      /* toast already fired */
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="lg">
        <DialogTitle className="text-base font-semibold mb-3">
          Edit document details
        </DialogTitle>
        <div className="space-y-3">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm min-h-[44px]"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PolicyDocumentCategory)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm min-h-[44px]"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <p className="text-xs text-muted">
            Editing metadata does <strong>not</strong> create a new version or
            invalidate existing acknowledgements. To replace the PDF, use
            &quot;Upload new version&quot;.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={update.isPending}
              className="min-h-[44px] px-4 py-2 text-sm font-medium text-muted"
            >
              Cancel
            </button>
            <Button
              variant="primary"
              size="md"
              onClick={submit}
              disabled={!valid || update.isPending}
              loading={update.isPending}
            >
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Acknowledgements dialog
// ═══════════════════════════════════════════════════════════════════════════

function AcknowledgementsDialog({ doc, onClose }: { doc: PolicyDocumentListItem; onClose: () => void }) {
  const { data, isLoading } = usePolicyAcknowledgements(doc.id);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent size="full">
        <DialogTitle className="text-base font-semibold mb-1">
          Acknowledgements — {doc.title}
        </DialogTitle>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted">
            <Loader2 className="mx-auto w-5 h-5 animate-spin" />
          </div>
        ) : !data ? null : (
          <>
            <p className="mb-4 text-sm text-muted">
              <span className="font-semibold text-foreground">
                {data.currentVersionAcked}
              </span>{" "}
              of {data.totalStaff} staff have acknowledged the current version
              {data.currentVersionNumber ? ` (v${data.currentVersionNumber})` : ""}.
            </p>
            {data.acknowledgements.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted">
                No acknowledgements yet.
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/40 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Staff member</th>
                      <th className="px-3 py-2 font-medium">Version</th>
                      <th className="px-3 py-2 font-medium">Acknowledged at</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.acknowledgements.map((row) => (
                      <tr key={row.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">
                            {row.userName}
                          </div>
                          <div className="text-xs text-muted">{row.userEmail}</div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[11px] font-medium text-brand">
                            v{row.versionNumber}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted">
                          {new Date(row.acknowledgedAt).toLocaleString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Archive confirmation
// ═══════════════════════════════════════════════════════════════════════════

function ArchiveConfirm({ doc, onClose }: { doc: PolicyDocumentListItem; onClose: () => void }) {
  const archive = useArchivePolicy();
  const target = !doc.isArchived;

  const handleConfirm = async () => {
    try {
      await archive.mutateAsync({ id: doc.id, isArchived: target });
      onClose();
    } catch {
      /* toast already fired */
    }
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={target ? "Archive document?" : "Unarchive document?"}
      description={
        target
          ? `Archiving "${doc.title}" removes it from the staff view. Acknowledgement history is preserved. You can unarchive at any time.`
          : `Unarchiving "${doc.title}" makes it visible to staff again. Their previous acknowledgements remain in effect.`
      }
      confirmLabel={target ? "Archive" : "Unarchive"}
      onConfirm={handleConfirm}
      variant={target ? "danger" : "default"}
      loading={archive.isPending}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared bits
// ═══════════════════════════════════════════════════════════════════════════

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function PdfFileInput({
  value,
  onChange,
}: {
  value: File | null;
  onChange: (f: File | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      onChange(null);
      setError(null);
      return;
    }
    if (f.type !== "application/pdf") {
      setError("Only PDF files are accepted.");
      onChange(null);
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File exceeds the 10MB size limit.");
      onChange(null);
      return;
    }
    setError(null);
    onChange(f);
  }

  return (
    <div className="space-y-2">
      <input
        type="file"
        accept="application/pdf"
        onChange={handleChange}
        className="block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-hover"
      />
      {value && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {value.name} ({Math.round(value.size / 1024)} KB)
        </div>
      )}
      {error && (
        <p className="text-xs text-rose-700">{error}</p>
      )}
    </div>
  );
}
