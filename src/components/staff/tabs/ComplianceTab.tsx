import type { StaffQualification, ComplianceCertificate } from "@prisma/client";
import { CertStatusBadge } from "@/components/staff/CertStatusBadge";
import { Download } from "lucide-react";

interface ComplianceTabProps {
  qualifications: StaffQualification[];
  certificates: ComplianceCertificate[];
  canManage: boolean;
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

export function ComplianceTab({ qualifications, certificates, canManage }: ComplianceTabProps) {
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
                  <div className="text-sm font-medium text-foreground">{q.name}</div>
                  <div className="text-xs text-muted">
                    {humanize(q.type)}
                    {q.institution ? ` · ${q.institution}` : ""}
                  </div>
                </div>
                <div className="text-xs text-muted">
                  Expires: {formatDate(q.expiryDate)}
                </div>
                <CertStatusBadge expiryDate={q.expiryDate} />
                {q.certificateUrl && (
                  <a
                    href={q.certificateUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </a>
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
          {canManage && (
            <button
              type="button"
              disabled
              title="Upload lands in a future chunk"
              className="text-sm text-muted px-3 py-1 rounded-md border border-border opacity-60 cursor-not-allowed"
            >
              Upload certificate
            </button>
          )}
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
                  Expires: {formatDate(c.expiryDate)}
                </div>
                <CertStatusBadge expiryDate={c.expiryDate} />
                {c.fileUrl && (
                  <a
                    href={c.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
