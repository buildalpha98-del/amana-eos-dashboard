"use client";

/**
 * Drag-and-drop "drop a PDF here" zone used on the staff profile's
 * Latest Contract card. Lets admins backfill existing off-platform
 * contracts (EH-era PDFs, scanned hard copies, etc.) without
 * retyping every field in the document.
 *
 * 2026-06-04 (initial cut) — completely metadata-free upload.
 * 2026-06-05: exposed two small fields above the dropzone — contract
 * type (dropdown) and pay rate ($/hr) — per Daniel's feedback. They
 * stay optional (sensible defaults) so single-click uploads still
 * work, but admins who know the values can pre-fill them so the
 * Contracts list / reports surface useful data.
 *
 * 2026-09-14: the PDF is read before it is uploaded. Selecting a file
 * sends it to /api/contracts/extract-terms, which pulls the pay rate,
 * hours, contract type and classification out of the document and
 * offers them for review. The admin applies or ignores them; nothing
 * is saved until they press Upload. Pay rates feed payroll, so a model
 * reading never writes one unattended — and reviewing every value is
 * also what makes reading an untrusted document safe.
 *
 * Posts to /api/contracts/quick-upload (multipart). On success
 * refreshes the route so the Latest Contract card re-fetches and
 * shows the just-attached PDF, and the /team yellow "no contract"
 * badge clears next time that page loads.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileText,
  Loader2,
  AlertCircle,
  Check,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { CONTRACT_TYPE_LABELS } from "@/components/contracts/constants";

interface Props {
  userId: string;
  /** Optional — shown in the success toast. */
  userName?: string;
}

const CONTRACT_TYPE_OPTIONS = [
  "ct_permanent",
  "ct_part_time",
  "ct_casual",
  "ct_fixed_term",
] as const;
type QuickContractType = (typeof CONTRACT_TYPE_OPTIONS)[number];

interface ExtractedTerms {
  payRate: number | null;
  payRateBasis: "hourly" | "weekly" | "annual" | null;
  payRateQuote: string | null;
  payRateDerived: boolean;
  hoursPerWeek: number | null;
  contractType: QuickContractType | null;
  classification: string | null;
  startDate: string | null;
  endDate: string | null;
  confidence: "high" | "medium" | "low";
  notes: string | null;
}

const CONFIDENCE_COPY: Record<ExtractedTerms["confidence"], string> = {
  high: "Stated plainly in the document",
  medium: "Worth a second look",
  low: "Low confidence — please check the document",
};

export function ContractQuickUpload({ userId, userName }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track the most recent uploaded filename so we can briefly show a
  // success state before the route.refresh() loads the new contract.
  const [lastUploaded, setLastUploaded] = useState<string | null>(null);
  // The only two fields the admin can pre-fill. Sensible defaults so
  // one-click uploads still work. payRate is a string in state to
  // tolerate empty input; coerced to a number at submit time.
  const [contractType, setContractType] =
    useState<QuickContractType>("ct_permanent");
  const [payRate, setPayRate] = useState<string>("");
  // Task 10.3: optional free-text award classification for the salary
  // history. Blank stays off the form data entirely.
  const [classification, setClassification] = useState<string>("");

  // The chosen file waits here while the document is read and the admin
  // reviews what came back. Nothing reaches the server until they press
  // Upload, so backing out costs nothing.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [terms, setTerms] = useState<ExtractedTerms | null>(null);

  function validate(file: File): string | null {
    if (file.type !== "application/pdf") return "PDF files only";
    if (file.size > 10 * 1024 * 1024) return "PDF too large (max 10 MB)";
    if (file.size === 0) return "File is empty";
    return null;
  }

  /**
   * Step 1 — read the document and pre-fill the fields above.
   *
   * The values land in the ordinary editable inputs rather than in some
   * separate "AI said" store: the admin sees exactly what will be saved and
   * can change any of it before pressing Upload. A failed read is not an
   * error state — the fields simply stay as they were.
   */
  async function analyseFile(file: File) {
    setError(null);
    const invalid = validate(file);
    if (invalid) {
      setError(invalid);
      return;
    }

    setPendingFile(file);
    setLastUploaded(null);
    setTerms(null);
    setAnalysing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/contracts/extract-terms", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't read the contract");
      }
      const { terms: found } = (await res.json()) as { terms: ExtractedTerms };
      setTerms(found);
      if (found.payRate !== null) setPayRate(String(found.payRate));
      if (found.contractType) setContractType(found.contractType);
      if (found.classification) setClassification(found.classification);
    } catch (err) {
      // Reading is a convenience. Losing it must not block the upload, so
      // this is a quiet note next to the fields, not a failure.
      setTerms(null);
      toast({
        description:
          err instanceof Error
            ? err.message
            : "Couldn't read the contract — enter the details yourself.",
      });
    } finally {
      setAnalysing(false);
    }
  }

  function discardPending() {
    setPendingFile(null);
    setTerms(null);
    setError(null);
  }

  /** Step 2 — the admin has reviewed the fields and pressed Upload. */
  async function uploadFile(file: File) {
    setError(null);
    const invalid = validate(file);
    if (invalid) {
      setError(invalid);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("userId", userId);
      formData.append("file", file);
      formData.append("contractType", contractType);
      // Empty / non-numeric pay rate → server treats as default (0).
      if (payRate.trim()) {
        formData.append("payRate", payRate.trim());
      }
      if (classification.trim()) {
        formData.append("classification", classification.trim());
      }
      // Raw fetch (not fetchApi) — FormData uploads bypass JSON
      // content-type handling. Same pattern as ContractFormFields.
      const res = await fetch("/api/contracts/quick-upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({ error: "Upload failed" }));
        throw new Error(body.error ?? "Upload failed");
      }
      setLastUploaded(file.name);
      setPendingFile(null);
      setTerms(null);
      toast({
        description: userName
          ? `Contract attached to ${userName}.`
          : "Contract attached.",
      });
      // Refresh the server component so the Latest Contract card
      // re-renders with the newly-attached PDF.
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Upload failed";
      setError(message);
      toast({ variant: "destructive", description: message });
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (uploading || analysing) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void analyseFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!uploading && !analysing) setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  function handleClick() {
    if (uploading || analysing) return;
    fileInputRef.current?.click();
  }

  function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    // Keyboard-accessible: Enter / Space opens the file picker.
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void analyseFile(file);
    // Reset so the same file can be picked again if the user wants
    // to retry after a failure.
    e.target.value = "";
  }

  return (
    <div className="space-y-3">
      {/* Two pre-fill fields above the dropzone. Stop propagation on
          clicks so interacting with the inputs doesn't also fire the
          dropzone's click handler. */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <label
            htmlFor="quick-upload-contract-type"
            className="block text-xs uppercase tracking-wide text-muted mb-1"
          >
            Contract type
          </label>
          <select
            id="quick-upload-contract-type"
            value={contractType}
            onChange={(e) =>
              setContractType(e.target.value as QuickContractType)
            }
            disabled={uploading || analysing}
            data-testid="quick-upload-contract-type"
            className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
          >
            {CONTRACT_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {CONTRACT_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="quick-upload-pay-rate"
            className="block text-xs uppercase tracking-wide text-muted mb-1"
          >
            Pay rate{" "}
            <span className="text-muted/70 normal-case">(AUD / hr)</span>
          </label>
          <input
            id="quick-upload-pay-rate"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={payRate}
            onChange={(e) => setPayRate(e.target.value)}
            disabled={uploading || analysing}
            placeholder="e.g. 32.50"
            data-testid="quick-upload-pay-rate"
            className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
          />
        </div>
        <div className="sm:col-span-2">
          <label
            htmlFor="quick-upload-classification"
            className="block text-xs uppercase tracking-wide text-muted mb-1"
          >
            Classification{" "}
            <span className="text-muted/70 normal-case">(optional)</span>
          </label>
          <input
            id="quick-upload-classification"
            type="text"
            value={classification}
            onChange={(e) => setClassification(e.target.value)}
            disabled={uploading || analysing}
            maxLength={200}
            placeholder="e.g. Children's Services Employee Level 3.1"
            data-testid="quick-upload-classification"
            className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
          />
        </div>
      </div>

      {/* What the document said. Shown after a read so the admin can sanity
          check the numbers now sitting in the fields above — the quote is
          there so they don't have to open the PDF to verify a rate. */}
      {terms && (
        <div className="rounded-lg border border-border bg-surface/60 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-brand" />
              Read from the document — check before uploading
            </p>
            <span
              className={cn(
                "text-2xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0",
                terms.confidence === "high"
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                  : terms.confidence === "medium"
                    ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
                    : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300",
              )}
            >
              {terms.confidence}
            </span>
          </div>
          <p className="text-xs text-muted">
            {CONFIDENCE_COPY[terms.confidence]}
          </p>
          {terms.payRate === null && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              No pay rate found — please enter it above.
            </p>
          )}
          {terms.payRateDerived && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              This rate was calculated from a{" "}
              {terms.payRateBasis === "annual" ? "yearly" : "weekly"} figure
              {terms.hoursPerWeek
                ? ` over ${terms.hoursPerWeek} hours a week`
                : " over a 38-hour week"}
              , not read directly. Double-check it.
            </p>
          )}
          {terms.payRateQuote && (
            <p className="text-xs text-muted italic border-l-2 border-border pl-2">
              &ldquo;{terms.payRateQuote}&rdquo;
            </p>
          )}
          {terms.notes && (
            <p className="text-xs text-muted">{terms.notes}</p>
          )}
        </div>
      )}

      {/* Confirm step. The file is still only in the browser at this
          point — Discard costs nothing. */}
      {pendingFile && !analysing && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/30 bg-brand/5 p-3">
          <p className="text-xs text-foreground min-w-0 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-brand shrink-0" />
            <span className="font-mono truncate">{pendingFile.name}</span>
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={discardPending}
              disabled={uploading}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Discard
            </button>
            <button
              type="button"
              onClick={() => void uploadFile(pendingFile)}
              disabled={uploading}
              data-testid="contract-quick-upload-confirm"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploading ? "Uploading…" : "Upload contract"}
            </button>
          </div>
        </div>
      )}

      <div
        role="button"
        tabIndex={uploading || analysing ? -1 : 0}
        aria-label="Drop a signed contract PDF here, or click to choose a file"
        data-testid="contract-quick-upload-dropzone"
        onClick={handleClick}
        onKeyDown={handleKey}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
          "focus:outline-none focus:ring-2 focus:ring-brand/40",
          (uploading || analysing) && "opacity-70 cursor-wait",
          dragging
            ? "border-brand bg-brand/5"
            : "border-border bg-surface/40 hover:bg-surface/70",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileInput}
          disabled={uploading || analysing}
          className="sr-only"
          aria-hidden="true"
        />
        <div className="flex flex-col items-center gap-2">
          {analysing ? (
            <>
              <Loader2 className="h-6 w-6 text-brand animate-spin" />
              <p className="text-sm font-medium text-foreground">
                Reading the contract…
              </p>
              <p className="text-xs text-muted">
                Pulling out the pay rate, hours and classification.
              </p>
            </>
          ) : uploading ? (
            <>
              <Loader2 className="h-6 w-6 text-brand animate-spin" />
              <p className="text-sm font-medium text-foreground">
                Uploading…
              </p>
            </>
          ) : lastUploaded ? (
            <>
              <Check className="h-6 w-6 text-emerald-600" />
              <p className="text-sm font-medium text-foreground">
                Attached <span className="font-mono">{lastUploaded}</span>
              </p>
              <p className="text-xs text-muted">
                Drop another to replace, or refresh to see it on the card above.
              </p>
            </>
          ) : (
            <>
              <Upload className="h-6 w-6 text-muted" />
              <p className="text-sm font-medium text-foreground">
                Drop a signed contract PDF here
              </p>
              <p className="text-xs text-muted">
                or click to choose a file · max 10 MB
              </p>
              <p className="text-xs text-muted/80 mt-1 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                We&apos;ll read the pay rate and terms out of it for you to check.
              </p>
            </>
          )}
        </div>
        {error && (
          <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
