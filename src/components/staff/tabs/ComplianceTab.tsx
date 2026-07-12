"use client";

import { useState } from "react";
import type { StaffQualification, ComplianceCertificate } from "@prisma/client";
import { CertStatusBadge } from "@/components/staff/CertStatusBadge";
import { CertActionBar } from "@/components/compliance/CertActionBar";
import { FileViewerModal } from "@/components/files/FileViewerModal";
import { PdLogSection } from "@/components/staff/PdLogSection";
import { Eye, AlertTriangle } from "lucide-react";

interface ComplianceTabProps {
  userId: string;
  qualifications: StaffQualification[];
  certificates: ComplianceCertificate[];
  canManage: boolean;
  /** True when the viewer is looking at their own profile. Enables self-record on PD log. */
  isSelf: boolean;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ComplianceTab({ userId, qualifications, certificates, canManage, isSelf }: ComplianceTabProps) {
  // Single shared viewer instance for all qualification rows. Clicking View
  // (or the filename) on any row sets `viewing` to that qualification and the
  // modal renders below. The CertActionBar component owns its own viewer for
  // compliance certs so cert rows don't go through this state.
  const [viewing, setViewing] = useState<StaffQualification | null>(null);

  return (
    <div className="space-y-6">
      {/* Qualifications */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Qualifications</h3>
          {canManage && (
            <button
              type="button"
              disabled
              title="Upload lands in a future chunk"
              className="text-sm text-muted px-3 py-1 rounded-md border border-border opacity-60 cursor-not-allowed"
            >
              Add qualification
            </button>
          )}
        </div>
        {qualifications.length === 0 ? (
          <p className="text-sm text-muted">No qualifications recorded.</p>
        ) : (
          <ul className="divide-y divide-border">
            {qualifications.map((q) => (
              <li key={q.id} className="py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  {/* Filename / name doubles as a clickable affordance when a
                      file is attached — matches the user spec "filename should
                      also be clickable as a secondary way to open." */}
                  {q.certificateUrl ? (
                    <button
                      type="button"
                      onClick={() => setViewing(q)}
                      className="text-sm font-medium text-foreground hover:text-brand hover:underline text-left"
                      data-testid="qualification-name-button"
                    >
                      {q.name}
                    </button>
                  ) : (
                    <div className="text-sm font-medium text-foreground">{q.name}</div>
                  )}
                  <div className="text-xs text-muted">
                    {humanize(q.type)}
                    {q.institution ? ` · ${q.institution}` : ""}
                  </div>
                </div>
                <div className="text-xs text-muted">
                  {q.expiryDate ? `Expires: ${formatDate(q.expiryDate)}` : "No expiry"}
                </div>
                <CertStatusBadge
                  expiryDate={q.expiryDate}
                  noExpiry={!!q.certificateUrl && !q.expiryDate}
                />
                {q.certificateUrl ? (
                  <button
                    type="button"
                    onClick={() => setViewing(q)}
                    className="inline-flex items-center gap-1 text-sm text-brand hover:underline shrink-0"
                    data-testid="qualification-view-button"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View
                  </button>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded shrink-0"
                    title="No certificate file has been uploaded for this record yet"
                    data-testid="qualification-no-file-badge"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    No file attached
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Compliance certificates */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Compliance certificates</h3>
        </div>
        {certificates.length === 0 ? (
          <p className="text-sm text-muted">No certificates uploaded.</p>
        ) : (
          <ul className="divide-y divide-border">
            {certificates.map((c) => (
              <li key={c.id} className="py-3 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <div className="text-sm font-medium text-foreground">
                    {c.label || humanize(c.type)}
                  </div>
                  {c.label && (
                    <div className="text-xs text-muted">{humanize(c.type)}</div>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {c.expiryDate ? `Expires: ${formatDate(c.expiryDate)}` : "No expiry"}
                </div>
                <CertStatusBadge
                  expiryDate={c.expiryDate}
                  noExpiry={!!c.fileUrl && !c.expiryDate}
                />
                <CertActionBar
                  cert={c}
                  canEdit={canManage}
                  canDelete={canManage}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Professional Development log — OWNA gap F. canManage gates admin
          edits; isSelf gates self-recording (staff log their own CPD hours). */}
      <PdLogSection userId={userId} canManage={canManage} isSelf={isSelf} />

      {viewing && (
        <FileViewerModal
          open={!!viewing}
          onClose={() => setViewing(null)}
          title={viewing.name}
          viewerUrl={`/api/qualifications/${viewing.id}/download`}
          downloadUrl={`/api/qualifications/${viewing.id}/download?download=1`}
          fileName={viewing.name}
        />
      )}
    </div>
  );
}
