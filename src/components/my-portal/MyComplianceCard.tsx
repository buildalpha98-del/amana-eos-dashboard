"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, ShieldCheck } from "lucide-react";
import { CertStatusBadge } from "@/components/staff/CertStatusBadge";
import { fetchApi } from "@/lib/fetch-api";

/** Shape returned by GET /api/compliance (filtered server-side to own certs for staff role). */
interface MyCert {
  id: string;
  type: string;
  label: string | null;
  issueDate: string;
  expiryDate: string;
  fileUrl: string | null;
  fileName: string | null;
}

const CERT_TYPE_LABELS: Record<string, string> = {
  wwcc: "WWCC",
  first_aid: "First Aid",
  anaphylaxis: "Anaphylaxis",
  asthma: "Asthma",
  cpr: "CPR",
  police_check: "Police Check",
  annual_review: "Annual Review",
  other: "Other",
};

function labelFor(cert: MyCert): string {
  return cert.label || CERT_TYPE_LABELS[cert.type] || cert.type;
}

interface MyComplianceCardProps {
  /** Current user's id — used to client-side filter if server doesn't scope (defensive). */
  userId: string;
}

export function MyComplianceCard({ userId }: MyComplianceCardProps) {
  const { data, isLoading, error } = useQuery<MyCert[]>({
    queryKey: ["my-compliance", userId],
    queryFn: () => fetchApi<MyCert[]>("/api/compliance"),
    retry: 2,
    staleTime: 60_000,
  });

  // Server already scopes to the staff user, but coordinators/admins calling this
  // endpoint get everything — filter defensively so the "My" card always shows only self.
  const certs = (data ?? []).filter((c) => {
    const maybeUserId = (c as unknown as { userId?: string | null }).userId;
    return maybeUserId === undefined || maybeUserId === userId;
  });

  return (
    <div className="bg-card rounded-xl border border-border p-6" data-testid="my-compliance-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-brand" />
          My Compliance
        </h3>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">Loading certificates…</p>
      ) : error ? (
        <p className="text-sm text-red-600">
          Unable to load certificates. Please refresh the page.
        </p>
      ) : certs.length === 0 ? (
        <p className="text-sm text-muted">
          No certificates on file — contact your coordinator to upload them.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {certs.map((cert) => (
            <li
              key={cert.id}
              className="py-3 flex flex-wrap items-center gap-3"
              data-testid={`my-cert-${cert.id}`}
            >
              <div className="flex-1 min-w-[200px]">
                <div className="text-sm font-medium text-foreground">
                  {labelFor(cert)}
                </div>
                <div className="text-xs text-muted">
                  Expires: {new Date(cert.expiryDate).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>
              <CertStatusBadge expiryDate={cert.expiryDate ? new Date(cert.expiryDate) : null} />
              {cert.fileUrl ? (
                <a
                  href={`/api/compliance/${cert.id}/download`}
                  className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
                  data-testid={`my-cert-download-${cert.id}`}
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </a>
              ) : (
                <span className="text-xs text-muted">No file</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
