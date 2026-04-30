"use client";

import { useState, useRef, useCallback } from "react";
import {
  X,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Users,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/useToast";
import { useQueryClient } from "@tanstack/react-query";
import { ROLE_DISPLAY_NAMES } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedRow {
  name: string;
  email: string;
  role: Role;
  centre: string;
  serviceId: string | null;
  status: "valid" | "warning" | "error";
  statusMessage: string;
}

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

interface BulkInviteResult {
  created: number;
  skipped: Array<{ email: string; reason: string }>;
  errors: Array<{ email: string; error: string }>;
}

interface BulkInviteModalProps {
  open: boolean;
  onClose: () => void;
  currentUserRole: Role;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ROLES: Role[] = [
  "owner",
  "head_office",
  "admin",
  "marketing",
  "member",
  "member",
  "staff",
];

const ROLE_ALIASES: Record<string, Role> = {
  owner: "owner",
  "head office": "head_office",
  "state manager": "head_office",
  head_office: "head_office",
  admin: "admin",
  administrator: "admin",
  marketing: "marketing",
  coordinator: "member",
  "service coordinator": "member",
  member: "member",
  "centre director": "member",
  director: "member",
  staff: "staff",
  educator: "staff",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CSV_TEMPLATE = `name,email,role,centre
Jane Smith,jane@example.com,member,Bankstown
John Doe,john@example.com,staff,Liverpool
Sarah Khan,sarah@example.com,coordinator,`;

// ---------------------------------------------------------------------------
// CSV Parsing
// ---------------------------------------------------------------------------

function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return lines.map((line) => {
    const row: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        row.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    return row;
  });
}

function normalizeRole(raw: string): Role | null {
  const key = raw.toLowerCase().trim();
  return ROLE_ALIASES[key] ?? null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkInviteModal({
  open,
  onClose,
  currentUserRole,
}: BulkInviteModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "preview" | "inviting" | "result">("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [existingEmails, setExistingEmails] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BulkInviteResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // ── Helpers ──

  const reset = useCallback(() => {
    setStep("upload");
    setRows([]);
    setProgress(0);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  // ── Load services and existing emails for validation ──

  const loadValidationData = useCallback(async () => {
    const [servicesRes, usersRes] = await Promise.all([
      fetch("/api/services"),
      fetch("/api/users"),
    ]);
    const servicesData: ServiceOption[] = servicesRes.ok
      ? await servicesRes.json()
      : [];
    const usersData: Array<{ email: string }> = usersRes.ok
      ? await usersRes.json()
      : [];

    setServices(servicesData);
    const emails = new Set(usersData.map((u) => u.email.toLowerCase()));
    setExistingEmails(emails);
    return { services: servicesData, emails };
  }, []);

  // ── Validate & parse rows ──

  const validateRows = useCallback(
    (
      csvRows: string[][],
      svcList: ServiceOption[],
      emails: Set<string>,
    ): ParsedRow[] => {
      // Expect header row
      if (csvRows.length < 2) return [];

      const header = csvRows[0].map((h) => h.toLowerCase().trim());
      const nameIdx = header.findIndex((h) =>
        ["name", "full name", "staff name"].includes(h),
      );
      const emailIdx = header.findIndex((h) =>
        ["email", "email address"].includes(h),
      );
      const roleIdx = header.findIndex((h) => ["role"].includes(h));
      const centreIdx = header.findIndex((h) =>
        ["centre", "center", "service", "location"].includes(h),
      );

      if (nameIdx === -1 || emailIdx === -1) {
        toast({
          description:
            "CSV must have 'name' and 'email' columns. Please check your file.",
        });
        return [];
      }

      const seenEmails = new Set<string>();
      const parsed: ParsedRow[] = [];

      for (let i = 1; i < csvRows.length; i++) {
        const row = csvRows[i];
        const name = row[nameIdx]?.trim() || "";
        const email = row[emailIdx]?.trim().toLowerCase() || "";
        const roleRaw = roleIdx >= 0 ? row[roleIdx]?.trim() || "" : "";
        const centre = centreIdx >= 0 ? row[centreIdx]?.trim() || "" : "";

        // Skip completely empty rows
        if (!name && !email) continue;

        // Validate required fields
        if (!name || !email) {
          parsed.push({
            name: name || "(missing)",
            email: email || "(missing)",
            role: "member",
            centre,
            serviceId: null,
            status: "error",
            statusMessage: !name ? "Missing name" : "Missing email",
          });
          continue;
        }

        // Validate email format
        if (!EMAIL_REGEX.test(email)) {
          parsed.push({
            name,
            email,
            role: "member",
            centre,
            serviceId: null,
            status: "error",
            statusMessage: "Invalid email format",
          });
          continue;
        }

        // Check for duplicates in DB
        if (emails.has(email)) {
          parsed.push({
            name,
            email,
            role: "member",
            centre,
            serviceId: null,
            status: "warning",
            statusMessage: "Email already exists",
          });
          continue;
        }

        // Check for duplicates within CSV
        if (seenEmails.has(email)) {
          parsed.push({
            name,
            email,
            role: "member",
            centre,
            serviceId: null,
            status: "warning",
            statusMessage: "Duplicate email in CSV",
          });
          continue;
        }

        seenEmails.add(email);

        // Parse role
        const role = normalizeRole(roleRaw) || "member";

        // Match centre to service
        let serviceId: string | null = null;
        if (centre) {
          const matched = svcList.find(
            (s) =>
              s.name.toLowerCase().includes(centre.toLowerCase()) ||
              s.code.toLowerCase() === centre.toLowerCase(),
          );
          serviceId = matched?.id ?? null;
        }

        // Validate: non-owners cannot add owners
        if (role === "owner" && currentUserRole !== "owner") {
          parsed.push({
            name,
            email,
            role,
            centre,
            serviceId,
            status: "error",
            statusMessage: "Only owners can invite owners",
          });
          continue;
        }

        parsed.push({
          name,
          email,
          role,
          centre,
          serviceId,
          status: "valid",
          statusMessage: roleRaw && !normalizeRole(roleRaw)
            ? `Unknown role "${roleRaw}" — defaulting to Centre Director`
            : "",
        });
      }

      return parsed;
    },
    [currentUserRole],
  );

  // ── File handling ──

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".csv")) {
        toast({ description: "Please upload a .csv file" });
        return;
      }

      const text = await file.text();
      const csvRows = parseCSV(text);

      const { services: svcList, emails } = await loadValidationData();
      const parsed = validateRows(csvRows, svcList, emails);

      if (parsed.length === 0) {
        toast({ description: "No valid rows found in CSV" });
        return;
      }

      setRows(parsed);
      setStep("preview");
    },
    [loadValidationData, validateRows],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  // ── Download template ──

  const downloadTemplate = useCallback(() => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk-invite-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── Invite ──

  const handleInvite = useCallback(async () => {
    const validRows = rows.filter((r) => r.status === "valid");
    if (validRows.length === 0) return;

    setStep("inviting");
    setProgress(0);

    const payload = {
      users: validRows.map((r) => ({
        name: r.name,
        email: r.email,
        role: r.role,
        serviceIds: r.serviceId ? [r.serviceId] : undefined,
      })),
    };

    try {
      // Simulate progress during the API call
      const progressInterval = setInterval(() => {
        setProgress((p) => Math.min(p + 2, 90));
      }, 200);

      const res = await fetch("/api/users/bulk-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Bulk invite failed");
      }

      const data: BulkInviteResult = await res.json();
      setResult(data);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["users"] });

      toast({
        description: `${data.created} user${data.created !== 1 ? "s" : ""} invited successfully`,
      });
    } catch (err) {
      toast({
        description:
          err instanceof Error ? err.message : "Bulk invite failed",
      });
      setStep("preview");
    }
  }, [rows, queryClient]);

  // ── Update row role ──

  const updateRowRole = useCallback((index: number, newRole: Role) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, role: newRole } : r)),
    );
  }, []);

  // ── Counts ──

  const validCount = rows.filter((r) => r.status === "valid").length;
  const warningCount = rows.filter((r) => r.status === "warning").length;
  const errorCount = rows.filter((r) => r.status === "error").length;

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-brand" />
            <h3 className="text-lg font-semibold text-foreground">
              Bulk Invite Users
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-md text-muted hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* ── Step: Upload ── */}
          {step === "upload" && (
            <div className="space-y-6">
              <p className="text-sm text-muted">
                Upload a CSV file to invite multiple users at once. Each user
                will receive a welcome email with a temporary password.
              </p>

              {/* Drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                  dragActive
                    ? "border-brand bg-brand/5"
                    : "border-border hover:border-brand/40 hover:bg-surface",
                )}
              >
                <Upload className="w-8 h-8 text-muted mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground/80">
                  Drop your CSV file here, or click to browse
                </p>
                <p className="text-xs text-muted mt-1">
                  Accepts .csv files up to 500 rows
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Template download */}
              <div className="flex items-center justify-between p-4 bg-surface/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-muted" />
                  <div>
                    <p className="text-sm font-medium text-foreground/80">
                      CSV Template
                    </p>
                    <p className="text-xs text-muted">
                      Download a sample CSV with the correct columns
                    </p>
                  </div>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-border text-foreground/80 hover:bg-card transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download Template
                </button>
              </div>

              {/* Expected format */}
              <div>
                <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                  Expected Columns
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    <span className="text-foreground/80">
                      <strong>name</strong> — Full name
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    <span className="text-foreground/80">
                      <strong>email</strong> — Email address
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted">-</span>
                    <span className="text-foreground/80">
                      <strong>role</strong> — member, staff, coordinator, etc.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted">-</span>
                    <span className="text-foreground/80">
                      <strong>centre</strong> — Service name or code
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Step: Preview ── */}
          {step === "preview" && (
            <div className="space-y-4">
              {/* Summary badges */}
              <div className="flex items-center gap-3">
                {validCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {validCount} valid
                  </span>
                )}
                {warningCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {warningCount} skipped
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700">
                    <XCircle className="w-3.5 h-3.5" />
                    {errorCount} invalid
                  </span>
                )}
              </div>

              {/* Preview table */}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-sm">
                    <thead className="bg-surface/50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted uppercase w-8">
                          #
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted uppercase">
                          Status
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted uppercase">
                          Name
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted uppercase">
                          Email
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted uppercase">
                          Role
                        </th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted uppercase">
                          Centre
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {rows.map((row, i) => (
                        <tr
                          key={i}
                          className={cn(
                            row.status === "error" && "bg-red-50/50",
                            row.status === "warning" && "bg-yellow-50/50",
                          )}
                        >
                          <td className="px-3 py-2 text-muted">{i + 1}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {row.status === "valid" && (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                              )}
                              {row.status === "warning" && (
                                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                              )}
                              {row.status === "error" && (
                                <XCircle className="w-4 h-4 text-red-500" />
                              )}
                              {row.statusMessage && (
                                <span
                                  className={cn(
                                    "text-xs",
                                    row.status === "error"
                                      ? "text-red-600"
                                      : row.status === "warning"
                                        ? "text-yellow-600"
                                        : "text-muted",
                                  )}
                                >
                                  {row.statusMessage}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-foreground">
                            {row.name}
                          </td>
                          <td className="px-3 py-2 text-muted">
                            {row.email}
                          </td>
                          <td className="px-3 py-2">
                            {row.status === "valid" ? (
                              <select
                                value={row.role}
                                onChange={(e) =>
                                  updateRowRole(i, e.target.value as Role)
                                }
                                className="text-xs px-1.5 py-0.5 border border-border rounded text-foreground/80 bg-card"
                              >
                                {VALID_ROLES.filter(
                                  (r) =>
                                    currentUserRole === "owner" ||
                                    (r !== "owner" && r !== "head_office"),
                                ).map((r) => (
                                  <option key={r} value={r}>
                                    {ROLE_DISPLAY_NAMES[r]}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs text-muted">
                                {ROLE_DISPLAY_NAMES[row.role] || row.role}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted text-xs">
                            {row.centre || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Step: Inviting (progress) ── */}
          {step === "inviting" && (
            <div className="py-8 text-center space-y-4">
              <Loader2 className="w-8 h-8 text-brand animate-spin mx-auto" />
              <p className="text-sm font-medium text-foreground/80">
                Sending invites...
              </p>
              <div className="max-w-xs mx-auto">
                <div className="h-2 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-muted mt-2">{progress}%</p>
              </div>
            </div>
          )}

          {/* ── Step: Result ── */}
          {step === "result" && result && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 rounded-lg bg-green-50 text-center">
                  <p className="text-2xl font-bold text-green-700">
                    {result.created}
                  </p>
                  <p className="text-xs text-green-600 mt-1">Invited</p>
                </div>
                <div className="p-4 rounded-lg bg-yellow-50 text-center">
                  <p className="text-2xl font-bold text-yellow-700">
                    {result.skipped.length}
                  </p>
                  <p className="text-xs text-yellow-600 mt-1">Skipped</p>
                </div>
                <div className="p-4 rounded-lg bg-red-50 text-center">
                  <p className="text-2xl font-bold text-red-700">
                    {result.errors.length}
                  </p>
                  <p className="text-xs text-red-600 mt-1">Failed</p>
                </div>
              </div>

              {/* Skipped details */}
              {result.skipped.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                    Skipped
                  </p>
                  <div className="bg-yellow-50 rounded-lg p-3 space-y-1">
                    {result.skipped.map((s, i) => (
                      <p key={i} className="text-xs text-yellow-700">
                        <strong>{s.email}</strong> — {s.reason}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Error details */}
              {result.errors.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
                    Errors
                  </p>
                  <div className="bg-red-50 rounded-lg p-3 space-y-1">
                    {result.errors.map((e, i) => (
                      <p key={i} className="text-xs text-red-700">
                        <strong>{e.email}</strong> — {e.error}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          {step === "upload" && (
            <>
              <div />
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-foreground/80 border border-border rounded-lg hover:bg-surface transition-colors"
              >
                Cancel
              </button>
            </>
          )}

          {step === "preview" && (
            <>
              <button
                onClick={reset}
                className="px-4 py-2 text-sm font-medium text-foreground/80 border border-border rounded-lg hover:bg-surface transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleInvite}
                disabled={validCount === 0}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                  validCount > 0
                    ? "bg-brand text-white hover:bg-brand-hover"
                    : "bg-surface text-muted cursor-not-allowed",
                )}
              >
                <Users className="w-4 h-4" />
                Invite {validCount} Valid User{validCount !== 1 ? "s" : ""}
              </button>
            </>
          )}

          {step === "inviting" && (
            <>
              <div />
              <p className="text-xs text-muted">
                Please wait, this may take a moment...
              </p>
            </>
          )}

          {step === "result" && (
            <>
              <div />
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
