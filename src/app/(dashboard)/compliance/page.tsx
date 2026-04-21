"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  useComplianceCerts,
  useCreateCert,
  useUpdateCert,
  useDeleteCert,
  type ComplianceCertData,
} from "@/hooks/useCompliance";
import {
  ShieldCheck,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
  Trash2,
  Eye,
  Upload,
  FileText,
  ExternalLink,
  FileSpreadsheet,
} from "lucide-react";
import { ImportWizard, type ColumnConfig } from "@/components/import/ImportWizard";
import { ExportButton } from "@/components/ui/ExportButton";
import { exportToCsv } from "@/lib/csv-export";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/useToast";
import { ErrorState } from "@/components/ui/ErrorState";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import ComplianceMatrixView from "@/components/compliance/ComplianceMatrixView";
import { ComplianceMatrix } from "@/components/compliance/ComplianceMatrix";
import { AuditCalendarTab } from "@/components/compliance/AuditCalendarTab";
import { AuditResultsTab } from "@/components/compliance/AuditResultsTab";
import { QualificationRatiosTab } from "@/components/compliance/QualificationRatiosTab";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  CalendarDays,
  BarChart3,
  GraduationCap,
  Grid3X3,
  List,
  LayoutGrid,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const typeLabels: Record<string, string> = {
  wwcc: "WWCC",
  first_aid: "First Aid",
  anaphylaxis: "Anaphylaxis",
  asthma: "Asthma",
  cpr: "CPR",
  police_check: "Police Check",
  annual_review: "Annual Review",
  child_protection: "Child Protection",
  geccko: "GECCKO",
  food_safety: "Food Safety",
  food_handler: "Food Handler",
  other: "Other",
};

const typeBadgeColors: Record<string, string> = {
  wwcc: "bg-indigo-100 text-indigo-700",
  first_aid: "bg-red-100 text-red-700",
  anaphylaxis: "bg-orange-100 text-orange-700",
  asthma: "bg-teal-100 text-teal-700",
  cpr: "bg-rose-100 text-rose-700",
  police_check: "bg-slate-100 text-slate-700",
  annual_review: "bg-violet-100 text-violet-700",
  child_protection: "bg-blue-100 text-blue-700",
  geccko: "bg-emerald-100 text-emerald-700",
  food_safety: "bg-amber-100 text-amber-700",
  food_handler: "bg-yellow-100 text-yellow-700",
  other: "bg-surface text-foreground/80",
};

const certTypes = [
  "wwcc",
  "first_aid",
  "anaphylaxis",
  "asthma",
  "cpr",
  "police_check",
  "annual_review",
  "child_protection",
  "geccko",
  "food_safety",
  "food_handler",
  "other",
] as const;

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

interface UserOption {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function daysUntilExpiry(expiryDate: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function expiryStatus(days: number): "expired" | "critical" | "warning" | "valid" {
  if (days < 0) return "expired";
  if (days <= 7) return "critical";
  if (days <= 30) return "warning";
  return "valid";
}

function statusColor(status: string) {
  switch (status) {
    case "expired":
    case "critical":
      return "text-red-600 bg-red-50 border-red-200";
    case "warning":
      return "text-amber-600 bg-amber-50 border-amber-200";
    default:
      return "text-emerald-600 bg-emerald-50 border-emerald-200";
  }
}

function statusDot(status: string) {
  switch (status) {
    case "expired":
    case "critical":
      return "bg-red-500";
    case "warning":
      return "bg-amber-500";
    default:
      return "bg-emerald-500";
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1);
  return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Staff / Member Upload View                                          */
/* ------------------------------------------------------------------ */

function StaffComplianceView() {
  const { data: certs = [], isLoading, error, refetch } = useComplianceCerts();
  const createCert = useCreateCert();
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<string>("");

  const certMap = useMemo(() => {
    const map: Record<string, ComplianceCertData> = {};
    certs.forEach((c) => {
      // Keep latest cert per type
      if (!map[c.type] || new Date(c.expiryDate) > new Date(map[c.type].expiryDate)) {
        map[c.type] = c;
      }
    });
    return map;
  }, [certs]);

  const handleUpload = async (type: string) => {
    setUploadType(type);
    fileRef.current?.click();
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadType) return;

    setUploading(uploadType);
    try {
      // Upload file via /api/upload
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url } = await uploadRes.json();

      // Create compliance cert with file
      const today = new Date().toISOString().split("T")[0];
      const oneYearLater = new Date();
      oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

      await createCert.mutateAsync({
        serviceId: "auto", // Will be overridden by API for staff
        type: uploadType,
        label: `${typeLabels[uploadType]} - ${file.name}`,
        issueDate: today,
        expiryDate: oneYearLater.toISOString().split("T")[0],
        fileUrl: url,
        fileName: file.name,
      });
      toast({ title: "Document uploaded", description: "Your compliance document has been uploaded successfully." });
    } catch (err) {
      toast({ title: "Upload failed", description: "There was a problem uploading your document. Please try again.", variant: "destructive" });
    } finally {
      setUploading(null);
      setUploadType("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-border border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <ErrorState
          title="Failed to load compliance"
          error={error as Error}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        onChange={onFileSelected}
      />

      <PageHeader
        title="My Compliance Documents"
        description="Upload and manage your required compliance certificates"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {certTypes.filter((t) => t !== "other").map((type) => {
          const cert = certMap[type];
          const days = cert ? daysUntilExpiry(cert.expiryDate) : null;
          const status = days !== null ? expiryStatus(days) : null;
          const isUploading = uploading === type;

          return (
            <div
              key={type}
              className={cn(
                "bg-card rounded-xl border p-5 transition-all",
                cert
                  ? status === "expired" || status === "critical"
                    ? "border-red-200"
                    : status === "warning"
                    ? "border-amber-200"
                    : "border-emerald-200"
                  : "border-border border-dashed"
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs font-semibold px-2.5 py-1 rounded-full",
                      typeBadgeColors[type]
                    )}
                  >
                    {typeLabels[type]}
                  </span>
                  {cert && status && (
                    <span
                      className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-lg border",
                        statusColor(status)
                      )}
                    >
                      {status === "expired"
                        ? "Expired"
                        : status === "critical"
                        ? `${days}d left`
                        : status === "warning"
                        ? `${days}d left`
                        : "Valid"}
                    </span>
                  )}
                </div>
                {!cert && (
                  <span className="text-xs text-muted font-medium">Missing</span>
                )}
              </div>

              {cert ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Expires</span>
                    <span className="font-medium text-foreground/80">
                      {formatDate(cert.expiryDate)}
                    </span>
                  </div>
                  {cert.fileUrl && (
                    <a
                      href={cert.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-brand hover:underline"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {cert.fileName || "View document"}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button
                    onClick={() => handleUpload(type)}
                    disabled={isUploading}
                    className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-brand border border-brand/20 rounded-lg hover:bg-brand/5 transition-colors disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    {isUploading ? "Uploading..." : "Upload New Version"}
                  </button>
                </div>
              ) : (
                <div className="text-center py-3">
                  <p className="text-sm text-muted mb-3">
                    No document uploaded yet
                  </p>
                  <button
                    onClick={() => handleUpload(type)}
                    disabled={isUploading}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    {isUploading ? "Uploading..." : "Upload Document"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Admin Compliance View                                               */
/* ------------------------------------------------------------------ */

const complianceTabs = [
  { key: "certificates", label: "Certificates", icon: ShieldCheck },
  { key: "audit-calendar", label: "Audit Calendar", icon: CalendarDays },
  { key: "audit-results", label: "Audit Results", icon: BarChart3 },
  { key: "qual-ratios", label: "Qualification Ratios", icon: GraduationCap },
  { key: "matrix", label: "Compliance Matrix", icon: Grid3X3 },
] as const;

type ComplianceTabKey = (typeof complianceTabs)[number]["key"];

export default function CompliancePage() {
  const { data: session } = useSession();
  const role = (session?.user?.role as string) || "";
  const isServiceScoped = role === "staff" || role === "member";
  const [activeTab, setActiveTab] = useState<ComplianceTabKey>("certificates");
  const [view, setView] = useState<"list" | "matrix">("list");
  const [serviceFilter, setServiceFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  if (isServiceScoped) {
    return <StaffComplianceView />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Compliance"
          description="Staff certificates, NQS audits, qualification ratios & compliance tracking"
        />
        <div
          role="group"
          aria-label="View mode"
          className="inline-flex rounded-lg border border-border overflow-hidden shrink-0"
        >
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            data-testid="view-toggle-list"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors",
              view === "list"
                ? "bg-brand text-white"
                : "bg-card text-foreground/80 hover:bg-surface"
            )}
          >
            <List className="w-4 h-4" />
            List
          </button>
          <button
            type="button"
            onClick={() => setView("matrix")}
            aria-pressed={view === "matrix"}
            data-testid="view-toggle-matrix"
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors border-l border-border",
              view === "matrix"
                ? "bg-brand text-white"
                : "bg-card text-foreground/80 hover:bg-surface"
            )}
          >
            <LayoutGrid className="w-4 h-4" />
            Matrix
          </button>
        </div>
      </div>

      {view === "matrix" ? (
        <ComplianceMatrix serviceId={serviceFilter || undefined} />
      ) : (
        <>
          {/* Tab bar */}
          <div className="border-b border-border -mb-px overflow-x-auto">
            <nav className="flex gap-1" aria-label="Compliance tabs">
              {complianceTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                      isActive
                        ? "border-brand text-brand"
                        : "border-transparent text-muted hover:text-foreground hover:border-border"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab content */}
          {activeTab === "certificates" && <AdminComplianceView serviceFilter={serviceFilter} setServiceFilter={setServiceFilter} typeFilter={typeFilter} setTypeFilter={setTypeFilter} />}
          {activeTab === "audit-calendar" && <AuditCalendarTab />}
          {activeTab === "audit-results" && <AuditResultsTab />}
          {activeTab === "qual-ratios" && <QualificationRatiosTab />}
          {activeTab === "matrix" && <MatrixTabWrapper />}
        </>
      )}
    </div>
  );
}

function MatrixTabWrapper() {
  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await fetch("/api/services?limit=100");
      if (!res.ok) return [];
      const d = await res.json();
      return d.services || d;
    },
  });
  return <ComplianceMatrixView services={services} />;
}

const complianceImportColumns: ColumnConfig[] = [
  { key: "staffEmail", label: "Staff Email", required: true },
  { key: "staffName", label: "Staff Name" },
  { key: "service", label: "Centre / Code" },
  { key: "certType", label: "Certificate Type", required: true },
  { key: "issueDate", label: "Issue Date", required: true },
  { key: "expiryDate", label: "Expiry Date", required: true },
  { key: "notes", label: "Notes" },
];

function AdminComplianceView({ serviceFilter, setServiceFilter, typeFilter, setTypeFilter }: { serviceFilter: string; setServiceFilter: (v: string) => void; typeFilter: string; setTypeFilter: (v: string) => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [showImportCerts, setShowImportCerts] = useState(false);
  const queryClient = useQueryClient();
  const [deleteCertId, setDeleteCertId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [certPage, setCertPage] = useState(1);
  const CERTS_PER_PAGE = 25;

  const { data: certs = [], isLoading, error, refetch } = useComplianceCerts(
    serviceFilter ? { serviceId: serviceFilter } : undefined
  );
  const createCert = useCreateCert();
  const updateCert = useUpdateCert();
  const deleteCert = useDeleteCert();

  const { data: services = [] } = useQuery<ServiceOption[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  /* Stats */
  const stats = useMemo(() => {
    const now = new Date();
    const soon = new Date();
    soon.setDate(soon.getDate() + 30);
    let total = 0;
    let expired = 0;
    let expiringSoon = 0;
    let valid = 0;

    certs.forEach((c) => {
      total++;
      const days = daysUntilExpiry(c.expiryDate);
      if (days < 0) expired++;
      else if (days <= 30) expiringSoon++;
      else valid++;
    });

    return { total, expired, expiringSoon, valid };
  }, [certs]);

  /* Filtered, paginated, and grouped */
  const filteredCerts = useMemo(() => {
    if (!typeFilter) return certs;
    return certs.filter((c) => c.type === typeFilter);
  }, [certs, typeFilter]);

  const totalFilteredCerts = filteredCerts.length;
  const totalCertPages = Math.ceil(totalFilteredCerts / CERTS_PER_PAGE);

  const grouped = useMemo(() => {
    const start = (certPage - 1) * CERTS_PER_PAGE;
    const paginated = filteredCerts.slice(start, start + CERTS_PER_PAGE);
    const groups: Record<string, ComplianceCertData[]> = {};
    paginated.forEach((c) => {
      const key = monthKey(c.expiryDate);
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredCerts, certPage]);

  /* Create form state */
  const [form, setForm] = useState({
    serviceId: "",
    userId: "",
    type: "wwcc" as string,
    label: "",
    issueDate: "",
    expiryDate: "",
    notes: "",
    alertDays: 30,
  });

  const handleCreate = async () => {
    if (!form.serviceId || !form.issueDate || !form.expiryDate) return;
    try {
      await createCert.mutateAsync({
        serviceId: form.serviceId,
        userId: form.userId || null,
        type: form.type,
        label: form.label || null,
        issueDate: form.issueDate,
        expiryDate: form.expiryDate,
        notes: form.notes || null,
        alertDays: form.alertDays,
      });
      toast({ title: "Certificate added", description: "The compliance certificate has been created.", variant: "default" });
      setForm({
        serviceId: "",
        userId: "",
        type: "wwcc",
        label: "",
        issueDate: "",
        expiryDate: "",
        notes: "",
        alertDays: 30,
      });
      setShowCreate(false);
    } catch {
      toast({ title: "Error", description: "Failed to create certificate.", variant: "destructive" });
    }
  };

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <ErrorState
          title="Failed to load compliance"
          error={error as Error}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div>
      {/* Actions bar */}
      <div className="flex flex-wrap items-center justify-end gap-3 mb-6">
        <ExportButton
          onClick={() =>
            exportToCsv(
              `amana-compliance-${new Date().toISOString().slice(0, 10)}`,
              filteredCerts,
              [
                { header: "ID", accessor: (c) => c.id },
                { header: "Staff", accessor: (c) => c.user?.name ?? "N/A" },
                { header: "Email", accessor: (c) => c.user?.email ?? "" },
                { header: "Centre", accessor: (c) => c.service?.name ?? "" },
                { header: "Type", accessor: (c) => typeLabels[c.type] || c.type },
                { header: "Label", accessor: (c) => c.label ?? "" },
                { header: "Issue Date", accessor: (c) => new Date(c.issueDate).toLocaleDateString("en-AU") },
                { header: "Expiry Date", accessor: (c) => new Date(c.expiryDate).toLocaleDateString("en-AU") },
                { header: "Days Until Expiry", accessor: (c) => daysUntilExpiry(c.expiryDate) },
                { header: "Status", accessor: (c) => expiryStatus(daysUntilExpiry(c.expiryDate)) },
                { header: "Notes", accessor: (c) => c.notes ?? "" },
              ],
            )
          }
          disabled={filteredCerts.length === 0}
        />
        <button
          onClick={() => setShowImportCerts(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-border text-foreground/80 text-sm font-medium rounded-lg hover:bg-surface transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Import Certificates
        </button>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Certificate
        </button>
      </div>

      {/* Certificate content */}
      <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs font-medium text-muted uppercase tracking-wider mb-1">
                Total Certs
              </p>
              <p className="text-2xl font-bold text-foreground">{stats.total}</p>
            </div>
            <div className="bg-card rounded-xl border border-amber-200 p-4">
              <p className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1">
                Expiring Soon
              </p>
              <p className="text-2xl font-bold text-amber-600">{stats.expiringSoon}</p>
            </div>
            <div className="bg-card rounded-xl border border-red-200 p-4">
              <p className="text-xs font-medium text-red-600 uppercase tracking-wider mb-1">
                Expired
              </p>
              <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
            </div>
            <div className="bg-card rounded-xl border border-emerald-200 p-4">
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider mb-1">
                Valid
              </p>
              <p className="text-2xl font-bold text-emerald-600">{stats.valid}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <select
              value={serviceFilter}
              onChange={(e) => { setServiceFilter(e.target.value); setCertPage(1); }}
              className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="">All Centres</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setCertPage(1); }}
              className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="">All Types</option>
              {certTypes.map((t) => (
                <option key={t} value={t}>
                  {typeLabels[t]}
                </option>
              ))}
            </select>
            {(serviceFilter || typeFilter) && (
              <button
                onClick={() => {
                  setServiceFilter("");
                  setTypeFilter("");
                  setCertPage(1);
                }}
                className="text-xs text-brand hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-10 h-10 border-4 border-border border-t-brand rounded-full animate-spin" />
            </div>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center bg-card rounded-xl border border-border">
              <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
                <ShieldCheck className="w-8 h-8 text-brand" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                No certificates found
              </h3>
              <p className="text-sm text-muted max-w-sm mb-4">
                Add staff compliance certificates to track expiry dates and upcoming
                renewals.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add First Certificate
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-brand/5 border border-brand/20 rounded-xl">
                  <span className="text-sm font-medium text-foreground/80">{selectedIds.size} selected</span>
                  <button
                    onClick={async () => {
                      const promises = Array.from(selectedIds).map(id => updateCert.mutateAsync({ id, acknowledged: true }));
                      await Promise.all(promises);
                      toast({ title: "Acknowledged", description: `${selectedIds.size} certificates acknowledged.` });
                      setSelectedIds(new Set());
                    }}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    Acknowledge All
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-sm text-muted hover:underline ml-auto"
                  >
                    Clear selection
                  </button>
                </div>
              )}
              {grouped.map(([month, items]) => (
                <div key={month}>
                  <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
                    {monthLabel(month)}
                  </h3>
                  <div className="space-y-2">
                    {items.map((cert) => {
                      const days = daysUntilExpiry(cert.expiryDate);
                      const status = expiryStatus(days);
                      return (
                        <div
                          key={cert.id}
                          className={cn(
                            "bg-card rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3",
                            status === "expired" || status === "critical"
                              ? "border-red-200"
                              : status === "warning"
                              ? "border-amber-200"
                              : "border-border"
                          )}
                        >
                          {/* Checkbox + Status dot + type badge */}
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(cert.id)}
                              onChange={(e) => {
                                const next = new Set(selectedIds);
                                if (e.target.checked) next.add(cert.id);
                                else next.delete(cert.id);
                                setSelectedIds(next);
                              }}
                              className="w-4 h-4 rounded border-border text-brand focus:ring-brand flex-shrink-0"
                            />
                            <div
                              className={cn(
                                "w-2.5 h-2.5 rounded-full flex-shrink-0",
                                statusDot(status)
                              )}
                            />
                            <span
                              className={cn(
                                "text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0",
                                typeBadgeColors[cert.type] || "bg-surface text-foreground/80"
                              )}
                            >
                              {typeLabels[cert.type] || cert.type}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground truncate">
                                {cert.user?.name || cert.label || "Unnamed"}
                              </p>
                              <div className="flex items-center gap-2">
                                <p className="text-xs text-muted truncate">
                                  {cert.service.name}{" "}
                                  <span className="text-muted">({cert.service.code})</span>
                                </p>
                                {cert.fileUrl && (
                                  <a
                                    href={cert.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs text-brand hover:underline flex-shrink-0"
                                  >
                                    <FileText className="w-3 h-3" />
                                    File
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Expiry info */}
                          <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                            <div className="text-right">
                              <p className="text-xs text-muted">Expires</p>
                              <p className="text-sm font-medium text-foreground/80">
                                {formatDate(cert.expiryDate)}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "text-xs font-semibold px-2 py-1 rounded-lg border",
                                statusColor(status)
                              )}
                            >
                              {status === "expired"
                                ? `${Math.abs(days)}d overdue`
                                : status === "critical"
                                ? `${days}d left`
                                : status === "warning"
                                ? `${days}d left`
                                : `${days}d left`}
                            </span>

                            {/* Acknowledge expired */}
                            {(status === "expired" || status === "critical") &&
                              !cert.acknowledged && (
                                <button
                                  onClick={() =>
                                    updateCert.mutate({
                                      id: cert.id,
                                      acknowledged: true,
                                    }, {
                                      onSuccess: () => toast({ title: "Certificate acknowledged", description: "The certificate has been acknowledged.", variant: "default" }),
                                    })
                                  }
                                  className="p-1.5 text-muted hover:text-amber-600 transition-colors"
                                  title="Acknowledge"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              )}

                            {/* Delete */}
                            <button
                              onClick={() => setDeleteCertId(cert.id)}
                              className="p-1.5 text-muted hover:text-red-600 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          <Pagination
            page={certPage}
            totalPages={totalCertPages}
            onPageChange={(p) => { setCertPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            totalItems={totalFilteredCerts}
          />
        </>

      {/* Import Wizard */}
      {showImportCerts && (
        <ImportWizard
          title="Import Compliance Certificates"
          endpoint="/api/compliance/import"
          columnConfig={complianceImportColumns}
          onComplete={() => { queryClient.invalidateQueries({ queryKey: ["compliance-certs"] }); toast({ title: "Import complete", description: "Certificates have been imported.", variant: "default" }); }}
          onClose={() => setShowImportCerts(false)}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-border/50">
              <h3 className="text-lg font-semibold text-foreground">
                Add Certificate
              </h3>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg hover:bg-surface transition-colors"
              >
                <X className="w-5 h-5 text-muted" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Service */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Centre / Service *
                </label>
                <select
                  value={form.serviceId}
                  onChange={(e) =>
                    setForm({ ...form, serviceId: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                >
                  <option value="">Select centre...</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* User (optional) */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Staff Member (optional)
                </label>
                <select
                  value={form.userId}
                  onChange={(e) =>
                    setForm({ ...form, userId: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                >
                  <option value="">No specific staff member</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Certificate Type *
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                >
                  {certTypes.map((t) => (
                    <option key={t} value={t}>
                      {typeLabels[t]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Label */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. WWCC renewal for John"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">
                    Issue Date *
                  </label>
                  <input
                    type="date"
                    value={form.issueDate}
                    onChange={(e) =>
                      setForm({ ...form, issueDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">
                    Expiry Date *
                  </label>
                  <input
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) =>
                      setForm({ ...form, expiryDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
                />
              </div>

              {/* Alert Days */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  Alert Days Before Expiry
                </label>
                <input
                  type="number"
                  value={form.alertDays}
                  onChange={(e) =>
                    setForm({ ...form, alertDays: parseInt(e.target.value) || 30 })
                  }
                  min={1}
                  max={365}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-border/50">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-surface rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={
                  !form.serviceId ||
                  !form.issueDate ||
                  !form.expiryDate ||
                  createCert.isPending
                }
                className="px-4 py-2 text-sm font-medium text-white bg-brand rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createCert.isPending ? "Creating..." : "Add Certificate"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteCertId}
        onOpenChange={(open) => !open && setDeleteCertId(null)}
        title="Delete Certificate"
        description="Are you sure you want to delete this certificate? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deleteCertId) {
            deleteCert.mutate(deleteCertId, {
              onSuccess: () => {
                setDeleteCertId(null);
                toast({ title: "Certificate deleted", description: "The certificate has been removed.", variant: "default" });
              },
            });
          }
        }}
        loading={deleteCert.isPending}
      />
    </div>
  );
}
