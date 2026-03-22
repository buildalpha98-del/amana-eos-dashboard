"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Minus,
  Download,
  Users,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  X,
  FileText,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface CertEntry {
  type: string;
  status: "valid" | "expiring" | "expired" | "missing";
  expiryDate: string | null;
  daysLeft: number | null;
}

interface MatrixRow {
  userId: string;
  userName: string;
  serviceName: string;
  serviceCode: string;
  certs: CertEntry[];
  validCount: number;
  totalRequired: number;
}

interface MatrixSummary {
  totalStaff: number;
  fullyCompliant: number;
  atRisk: number;
  nonCompliant: number;
}

interface MatrixData {
  rows: MatrixRow[];
  summary: MatrixSummary;
}

interface ServiceOption {
  id: string;
  name: string;
  code: string;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

const TYPE_LABELS: Record<string, string> = {
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
};

const SHORT_LABELS: Record<string, string> = {
  wwcc: "WWCC",
  first_aid: "First Aid",
  anaphylaxis: "Anaphy.",
  asthma: "Asthma",
  cpr: "CPR",
  police_check: "Police",
  annual_review: "Review",
  child_protection: "Child Prot.",
  geccko: "GECCKO",
  food_safety: "Food Safe",
  food_handler: "Food Hndlr",
};

/* ------------------------------------------------------------------ */
/* Status Cell                                                         */
/* ------------------------------------------------------------------ */

function StatusCell({
  cert,
  onClick,
}: {
  cert: CertEntry;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center w-full h-full p-2 rounded-lg hover:bg-surface transition-colors group"
      title={
        cert.status === "valid"
          ? `Valid - expires ${cert.expiryDate}`
          : cert.status === "expiring"
          ? `Expiring in ${cert.daysLeft} days (${cert.expiryDate})`
          : cert.status === "expired"
          ? `Expired on ${cert.expiryDate}`
          : "Missing - no certificate uploaded"
      }
    >
      {cert.status === "valid" && (
        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
      )}
      {cert.status === "expiring" && (
        <div className="relative">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <span className="absolute -top-1 -right-3 text-[10px] font-bold text-amber-600">
            {cert.daysLeft}d
          </span>
        </div>
      )}
      {cert.status === "expired" && (
        <XCircle className="w-5 h-5 text-red-500" />
      )}
      {cert.status === "missing" && (
        <Minus className="w-5 h-5 text-muted/50" />
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Score Badge                                                         */
/* ------------------------------------------------------------------ */

function ScoreBadge({ valid, total }: { valid: number; total: number }) {
  const color =
    valid === total
      ? "bg-emerald-100 text-emerald-700"
      : valid >= 5
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-full",
        color
      )}
    >
      {valid}/{total}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Detail Modal                                                        */
/* ------------------------------------------------------------------ */

function CertDetailModal({
  cert,
  userName,
  onClose,
}: {
  cert: CertEntry;
  userName: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <h3 className="text-lg font-semibold text-foreground">
            {TYPE_LABELS[cert.type] || cert.type}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface transition-colors"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Staff Member</span>
            <span className="font-medium text-foreground">{userName}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Status</span>
            <span
              className={cn(
                "font-semibold px-2 py-0.5 rounded-lg text-xs",
                cert.status === "valid"
                  ? "bg-emerald-100 text-emerald-700"
                  : cert.status === "expiring"
                  ? "bg-amber-100 text-amber-700"
                  : cert.status === "expired"
                  ? "bg-red-100 text-red-700"
                  : "bg-surface text-muted"
              )}
            >
              {cert.status === "valid"
                ? "Valid"
                : cert.status === "expiring"
                ? "Expiring Soon"
                : cert.status === "expired"
                ? "Expired"
                : "Missing"}
            </span>
          </div>
          {cert.expiryDate && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Expiry Date</span>
              <span className="font-medium text-foreground">
                {new Date(cert.expiryDate).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          )}
          {cert.daysLeft !== null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Days Left</span>
              <span
                className={cn(
                  "font-medium",
                  cert.daysLeft < 0
                    ? "text-red-600"
                    : cert.daysLeft <= 30
                    ? "text-amber-600"
                    : "text-emerald-600"
                )}
              >
                {cert.daysLeft < 0
                  ? `${Math.abs(cert.daysLeft)} days overdue`
                  : `${cert.daysLeft} days`}
              </span>
            </div>
          )}
        </div>
        <div className="p-5 border-t border-border/50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-foreground/80 bg-surface rounded-lg hover:bg-border transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile Card                                                         */
/* ------------------------------------------------------------------ */

function MobileStaffCard({
  row,
  onCertClick,
}: {
  row: MatrixRow;
  onCertClick: (cert: CertEntry, userName: string) => void;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{row.userName}</p>
          <p className="text-xs text-muted">
            {row.serviceName}{" "}
            <span className="text-muted">({row.serviceCode})</span>
          </p>
        </div>
        <ScoreBadge valid={row.validCount} total={row.totalRequired} />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {row.certs.map((cert) => (
          <button
            key={cert.type}
            onClick={() => onCertClick(cert, row.userName)}
            className={cn(
              "flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors",
              cert.status === "valid"
                ? "border-emerald-200 bg-emerald-50"
                : cert.status === "expiring"
                ? "border-amber-200 bg-amber-50"
                : cert.status === "expired"
                ? "border-red-200 bg-red-50"
                : "border-border bg-surface/50"
            )}
          >
            {cert.status === "valid" && (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
            {cert.status === "expiring" && (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            )}
            {cert.status === "expired" && (
              <XCircle className="w-4 h-4 text-red-500" />
            )}
            {cert.status === "missing" && (
              <Minus className="w-4 h-4 text-muted/50" />
            )}
            <span className="text-[10px] font-medium text-muted text-center leading-tight">
              {SHORT_LABELS[cert.type] || cert.type}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */

interface ComplianceMatrixViewProps {
  services: ServiceOption[];
}

export default function ComplianceMatrixView({
  services,
}: ComplianceMatrixViewProps) {
  const [serviceFilter, setServiceFilter] = useState("");
  const [selectedCert, setSelectedCert] = useState<{
    cert: CertEntry;
    userName: string;
  } | null>(null);

  const { data, isLoading } = useQuery<MatrixData>({
    queryKey: ["compliance-matrix", serviceFilter],
    queryFn: async () => {
      const url = serviceFilter
        ? `/api/compliance/matrix?serviceId=${serviceFilter}`
        : "/api/compliance/matrix";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch matrix data");
      return res.json();
    },
  });

  const handleExport = () => {
    const url = serviceFilter
      ? `/api/compliance/export?serviceId=${serviceFilter}`
      : "/api/compliance/export";
    window.open(url, "_blank");
  };

  const handleCertClick = (cert: CertEntry, userName: string) => {
    setSelectedCert({ cert, userName });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-border border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const summary = data?.summary ?? {
    totalStaff: 0,
    fullyCompliant: 0,
    atRisk: 0,
    nonCompliant: 0,
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-muted" />
            <p className="text-xs font-medium text-muted uppercase tracking-wider">
              Total Staff
            </p>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {summary.totalStaff}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-emerald-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">
              Fully Compliant
            </p>
          </div>
          <p className="text-2xl font-bold text-emerald-600">
            {summary.fullyCompliant}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-amber-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">
              At Risk
            </p>
          </div>
          <p className="text-2xl font-bold text-amber-600">
            {summary.atRisk}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-red-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldX className="w-4 h-4 text-red-500" />
            <p className="text-xs font-medium text-red-600 uppercase tracking-wider">
              Non-Compliant
            </p>
          </div>
          <p className="text-2xl font-bold text-red-600">
            {summary.nonCompliant}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
          >
            <option value="">All Centres</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {serviceFilter && (
            <button
              onClick={() => setServiceFilter("")}
              className="text-xs text-brand hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 px-4 py-2 border border-border text-foreground/80 text-sm font-medium rounded-lg hover:bg-surface transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Desktop Table */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-card rounded-xl border border-border">
          <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-brand" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            No staff found
          </h3>
          <p className="text-sm text-muted max-w-sm">
            There are no active staff members assigned to centres. Assign staff
            to centres first to see the compliance matrix.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop view */}
          <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-semibold text-foreground/80 whitespace-nowrap">
                      Staff Name
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-foreground/80 whitespace-nowrap">
                      Centre
                    </th>
                    {Object.entries(TYPE_LABELS).map(([key, label]) => (
                      <th
                        key={key}
                        className="text-center px-2 py-3 font-semibold text-foreground/80 whitespace-nowrap"
                      >
                        {label}
                      </th>
                    ))}
                    <th className="text-center px-4 py-3 font-semibold text-foreground/80 whitespace-nowrap">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {rows.map((row) => (
                    <tr
                      key={row.userId}
                      className="hover:bg-surface/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                        {row.userName}
                      </td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">
                        {row.serviceName}{" "}
                        <span className="text-muted text-xs">
                          ({row.serviceCode})
                        </span>
                      </td>
                      {row.certs.map((cert) => (
                        <td key={cert.type} className="px-2 py-1">
                          <StatusCell
                            cert={cert}
                            onClick={() =>
                              handleCertClick(cert, row.userName)
                            }
                          />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center">
                        <ScoreBadge
                          valid={row.validCount}
                          total={row.totalRequired}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile view */}
          <div className="md:hidden space-y-3">
            {rows.map((row) => (
              <MobileStaffCard
                key={row.userId}
                row={row}
                onCertClick={handleCertClick}
              />
            ))}
          </div>
        </>
      )}

      {/* Detail Modal */}
      {selectedCert && (
        <CertDetailModal
          cert={selectedCert.cert}
          userName={selectedCert.userName}
          onClose={() => setSelectedCert(null)}
        />
      )}
    </div>
  );
}
