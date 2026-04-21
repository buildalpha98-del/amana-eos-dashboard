"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/Sheet";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { CertStatusBadge } from "@/components/staff/CertStatusBadge";
import { CertActionBar } from "@/components/compliance/CertActionBar";
import { useComplianceMatrix, type MatrixRow, type MatrixCertEntry } from "@/hooks/useComplianceMatrix";
import { useComplianceCerts, type ComplianceCertData } from "@/hooks/useCompliance";
import { ComplianceMatrixCell } from "@/components/compliance/ComplianceMatrixCell";

const CERT_TYPE_LABELS: Record<string, string> = {
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

interface SelectedCell {
  row: MatrixRow;
  cert: MatrixCertEntry;
}

export interface ComplianceMatrixProps {
  serviceId?: string;
  /** Optional initial selected cell, used for testing / deep-linking */
  initialSelected?: SelectedCell | null;
}

export function ComplianceMatrix({ serviceId, initialSelected = null }: ComplianceMatrixProps) {
  const { data: session } = useSession();
  const role = (session?.user?.role as string) || "";
  const currentUserId = (session?.user as { id?: string })?.id ?? "";
  const canDelete = role === "owner" || role === "head_office" || role === "admin";

  const [selected, setSelected] = useState<SelectedCell | null>(initialSelected);

  const { data, isLoading, error, refetch } = useComplianceMatrix(serviceId);

  // Pull underlying certs for the selected user so we can find the matching
  // ComplianceCertificate.id for CertActionBar. We only fetch when needed.
  const { data: userCerts = [], refetch: refetchCerts } = useComplianceCerts(
    selected?.row.userId ? undefined : undefined,
  );

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const certTypes = useMemo(() => {
    const firstRow = rows[0];
    if (!firstRow) return Object.keys(CERT_TYPE_LABELS);
    return firstRow.certs.map((c) => c.type);
  }, [rows]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" role="status" aria-live="polite">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
        <span className="sr-only">Loading matrix</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-red-200 rounded-xl p-6 text-sm text-red-700">
        <p className="font-medium mb-2">Failed to load compliance matrix</p>
        <p className="mb-3">{(error as Error).message}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-10 text-center text-sm text-muted">
        No staff assigned to centres — assign staff to a centre to populate the matrix.
      </div>
    );
  }

  const handleCellClick = (row: MatrixRow, cert: MatrixCertEntry) => {
    setSelected({ row, cert });
  };

  const matchingCert = selected
    ? userCerts.find(
        (c: ComplianceCertData) =>
          c.userId === selected.row.userId && c.type === selected.cert.type,
      ) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div
        data-testid="compliance-matrix-grid"
        className="bg-card border border-border rounded-xl overflow-x-auto"
      >
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-card text-left px-4 py-3 font-semibold text-foreground/80 border-b border-border whitespace-nowrap"
              >
                Staff
              </th>
              {certTypes.map((type) => (
                <th
                  key={type}
                  scope="col"
                  className="px-2 py-3 font-semibold text-foreground/80 text-center border-b border-border whitespace-nowrap"
                >
                  {CERT_TYPE_LABELS[type] ?? type}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="group">
                <th
                  scope="row"
                  className="sticky left-0 z-[5] bg-card group-hover:bg-surface/30 text-left px-4 py-2 border-b border-border/50 whitespace-nowrap"
                >
                  <div className="flex items-center gap-3">
                    <StaffAvatar
                      user={{ id: row.userId, name: row.userName }}
                      size="xs"
                    />
                    <div>
                      <div className="font-medium text-foreground">
                        {row.userName}
                      </div>
                      <div className="text-xs text-muted">
                        {row.serviceName}
                        {row.serviceCode && (
                          <span className="ml-1 text-muted">({row.serviceCode})</span>
                        )}
                      </div>
                    </div>
                  </div>
                </th>
                {row.certs.map((cert) => (
                  <td
                    key={cert.type}
                    className="px-1 py-2 text-center border-b border-border/50 group-hover:bg-surface/30"
                    data-cell-user={row.userId}
                    data-cell-type={cert.type}
                  >
                    <div className="flex justify-center">
                      <ComplianceMatrixCell
                        status={cert.status}
                        daysLeft={cert.daysLeft}
                        certTypeLabel={CERT_TYPE_LABELS[cert.type] ?? cert.type}
                        userName={row.userName}
                        onClick={() => handleCellClick(row, cert)}
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) setSelected(null);
        }}
      >
        <SheetContent className="p-6" width="max-w-md">
          {selected && (
            <div className="flex flex-col gap-5" data-testid="compliance-matrix-sheet">
              <div className="flex items-start justify-between">
                <div>
                  <SheetTitle className="text-lg font-semibold text-foreground">
                    {CERT_TYPE_LABELS[selected.cert.type] ?? selected.cert.type}
                  </SheetTitle>
                  <p className="text-sm text-muted mt-0.5">{selected.row.userName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Close"
                  className="p-1 rounded hover:bg-surface transition-colors"
                >
                  <X className="w-5 h-5 text-muted" />
                </button>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Status</span>
                <CertStatusBadge
                  expiryDate={
                    selected.cert.expiryDate ? new Date(selected.cert.expiryDate) : null
                  }
                />
              </div>

              {selected.cert.expiryDate && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">Expires</span>
                  <span className="font-medium text-foreground">
                    {new Date(selected.cert.expiryDate).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Centre</span>
                <span className="font-medium text-foreground">
                  {selected.row.serviceName}
                </span>
              </div>

              {matchingCert ? (
                <div className="pt-2 border-t border-border/50">
                  <p className="text-xs uppercase tracking-wider text-muted mb-3">
                    Actions
                  </p>
                  <CertActionBar
                    cert={{
                      id: matchingCert.id,
                      serviceId: matchingCert.serviceId,
                      userId: matchingCert.userId,
                      fileUrl: matchingCert.fileUrl,
                      fileName: matchingCert.fileName,
                      type: matchingCert.type,
                      issueDate: matchingCert.issueDate,
                      expiryDate: matchingCert.expiryDate,
                    }}
                    canEdit={
                      canDelete || matchingCert.userId === currentUserId
                    }
                    canDelete={canDelete}
                    onUpdated={() => {
                      refetch();
                      refetchCerts();
                    }}
                  />
                </div>
              ) : selected.cert.status === "missing" ? (
                <div className="pt-2 border-t border-border/50 text-sm text-muted">
                  No certificate uploaded yet.
                </div>
              ) : null}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default ComplianceMatrix;
