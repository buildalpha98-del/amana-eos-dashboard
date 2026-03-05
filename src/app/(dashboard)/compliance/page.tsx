"use client";

import { useState, useMemo, useRef } from "react";
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
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import ComplianceMatrixView from "@/components/compliance/ComplianceMatrixView";

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
  other: "bg-gray-100 text-gray-700",
};

const certTypes = [
  "wwcc",
  "first_aid",
  "anaphylaxis",
  "asthma",
  "cpr",
  "police_check",
  "annual_review",
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
  const { data: certs = [], isLoading } = useComplianceCerts();
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
    } catch (err) {
      console.error("Upload error:", err);
    } finally {
      setUploading(null);
      setUploadType("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-[#004E64] rounded-full animate-spin" />
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

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-[#004E64]" />
          My Compliance Documents
        </h2>
        <p className="text-gray-500 mt-1">
          Upload and manage your required compliance certificates
        </p>
      </div>

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
                "bg-white rounded-xl border p-5 transition-all",
                cert
                  ? status === "expired" || status === "critical"
                    ? "border-red-200"
                    : status === "warning"
                    ? "border-amber-200"
                    : "border-emerald-200"
                  : "border-gray-200 border-dashed"
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
                  <span className="text-xs text-gray-400 font-medium">Missing</span>
                )}
              </div>

              {cert ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Expires</span>
                    <span className="font-medium text-gray-700">
                      {formatDate(cert.expiryDate)}
                    </span>
                  </div>
                  {cert.fileUrl && (
                    <a
                      href={cert.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-[#004E64] hover:underline"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {cert.fileName || "View document"}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button
                    onClick={() => handleUpload(type)}
                    disabled={isUploading}
                    className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-[#004E64] border border-[#004E64]/20 rounded-lg hover:bg-[#004E64]/5 transition-colors disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    {isUploading ? "Uploading..." : "Upload New Version"}
                  </button>
                </div>
              ) : (
                <div className="text-center py-3">
                  <p className="text-sm text-gray-400 mb-3">
                    No document uploaded yet
                  </p>
                  <button
                    onClick={() => handleUpload(type)}
                    disabled={isUploading}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium text-white bg-[#004E64] rounded-lg hover:bg-[#003D52] transition-colors disabled:opacity-50"
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

export default function CompliancePage() {
  const { data: session } = useSession();
  const role = (session?.user?.role as string) || "";
  const isServiceScoped = role === "staff" || role === "member";

  if (isServiceScoped) {
    return <StaffComplianceView />;
  }

  return <AdminComplianceView />;
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

function AdminComplianceView() {
  const [showCreate, setShowCreate] = useState(false);
  const [showImportCerts, setShowImportCerts] = useState(false);
  const [viewMode, setViewMode] = useState<"calendar" | "matrix">("calendar");
  const queryClient = useQueryClient();
  const [serviceFilter, setServiceFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [deleteCertId, setDeleteCertId] = useState<string | null>(null);

  const { data: certs = [], isLoading } = useComplianceCerts(
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

  /* Filtered and grouped */
  const grouped = useMemo(() => {
    let filtered = certs;
    if (typeFilter) {
      filtered = filtered.filter((c) => c.type === typeFilter);
    }
    const groups: Record<string, ComplianceCertData[]> = {};
    filtered.forEach((c) => {
      const key = monthKey(c.expiryDate);
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [certs, typeFilter]);

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
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#004E64]" />
            Compliance Calendar
          </h2>
          <p className="text-gray-500 mt-1">
            Track staff certificates, compliance dates and upcoming renewals
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("calendar")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                viewMode === "calendar"
                  ? "bg-white text-[#004E64] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              Calendar
            </button>
            <button
              onClick={() => setViewMode("matrix")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                viewMode === "matrix"
                  ? "bg-white text-[#004E64] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              Matrix
            </button>
          </div>

          <button
            onClick={() => setShowImportCerts(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Import Certificates
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Certificate
          </button>
        </div>
      </div>

      {/* View Content */}
      {viewMode === "matrix" ? (
        <ComplianceMatrixView services={services} />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                Total Certs
              </p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="bg-white rounded-xl border border-amber-200 p-4">
              <p className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1">
                Expiring Soon
              </p>
              <p className="text-2xl font-bold text-amber-600">{stats.expiringSoon}</p>
            </div>
            <div className="bg-white rounded-xl border border-red-200 p-4">
              <p className="text-xs font-medium text-red-600 uppercase tracking-wider mb-1">
                Expired
              </p>
              <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
            </div>
            <div className="bg-white rounded-xl border border-emerald-200 p-4">
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
              onChange={(e) => setServiceFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
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
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
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
                }}
                className="text-xs text-[#004E64] hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-10 h-10 border-4 border-gray-200 border-t-[#004E64] rounded-full animate-spin" />
            </div>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
              <div className="w-16 h-16 rounded-2xl bg-[#004E64]/10 flex items-center justify-center mb-4">
                <ShieldCheck className="w-8 h-8 text-[#004E64]" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                No certificates found
              </h3>
              <p className="text-sm text-gray-500 max-w-sm mb-4">
                Add staff compliance certificates to track expiry dates and upcoming
                renewals.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#004E64] text-white text-sm font-medium rounded-lg hover:bg-[#003D52] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add First Certificate
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map(([month, items]) => (
                <div key={month}>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
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
                            "bg-white rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3",
                            status === "expired" || status === "critical"
                              ? "border-red-200"
                              : status === "warning"
                              ? "border-amber-200"
                              : "border-gray-200"
                          )}
                        >
                          {/* Status dot + type badge */}
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div
                              className={cn(
                                "w-2.5 h-2.5 rounded-full flex-shrink-0",
                                statusDot(status)
                              )}
                            />
                            <span
                              className={cn(
                                "text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0",
                                typeBadgeColors[cert.type] || "bg-gray-100 text-gray-700"
                              )}
                            >
                              {typeLabels[cert.type] || cert.type}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {cert.user?.name || cert.label || "Unnamed"}
                              </p>
                              <div className="flex items-center gap-2">
                                <p className="text-xs text-gray-500 truncate">
                                  {cert.service.name}{" "}
                                  <span className="text-gray-400">({cert.service.code})</span>
                                </p>
                                {cert.fileUrl && (
                                  <a
                                    href={cert.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs text-[#004E64] hover:underline flex-shrink-0"
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
                              <p className="text-xs text-gray-400">Expires</p>
                              <p className="text-sm font-medium text-gray-700">
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
                                    })
                                  }
                                  className="p-1.5 text-gray-400 hover:text-amber-600 transition-colors"
                                  title="Acknowledge"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              )}

                            {/* Delete */}
                            <button
                              onClick={() => setDeleteCertId(cert.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
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
        </>
      )}

      {/* Import Wizard */}
      {showImportCerts && (
        <ImportWizard
          title="Import Compliance Certificates"
          endpoint="/api/compliance/import"
          columnConfig={complianceImportColumns}
          onComplete={() => queryClient.invalidateQueries({ queryKey: ["compliance-certs"] })}
          onClose={() => setShowImportCerts(false)}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                Add Certificate
              </h3>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Service */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Centre / Service *
                </label>
                <select
                  value={form.serviceId}
                  onChange={(e) =>
                    setForm({ ...form, serviceId: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Staff Member (optional)
                </label>
                <select
                  value={form.userId}
                  onChange={(e) =>
                    setForm({ ...form, userId: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Certificate Type *
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. WWCC renewal for John"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Issue Date *
                  </label>
                  <input
                    type="date"
                    value={form.issueDate}
                    onChange={(e) =>
                      setForm({ ...form, issueDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expiry Date *
                  </label>
                  <input
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) =>
                      setForm({ ...form, expiryDate: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent resize-none"
                />
              </div>

              {/* Alert Days */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
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
                className="px-4 py-2 text-sm font-medium text-white bg-[#004E64] rounded-lg hover:bg-[#003D52] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              onSuccess: () => setDeleteCertId(null),
            });
          }
        }}
        loading={deleteCert.isPending}
      />
    </div>
  );
}
