"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Upload, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { toast } from "@/hooks/useToast";
import { StaffCertUploadModal } from "@/components/compliance/StaffCertUploadModal";
import { uploadFileSmart } from "@/lib/upload-client";

/**
 * Working With Children Check on the staff-facing profile.
 *
 * 2026-08-25: the induction gate requires a WWCC, and its blocker pointed at
 * /profile — which had no uploader. The only one lived on /compliance, a page
 * locked staff were redirected away from. Staff who had finished every course
 * still could not clear, and had no way to see why.
 *
 * This is a deliberately narrow surface: the one certificate the gate checks,
 * plus a link to /compliance for everything else.
 */

type Cert = {
  id: string;
  type: string;
  fileUrl: string | null;
  expiryDate: string | null;
};

export function MyCertificatesSection({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data: certs = [] } = useQuery<Cert[]>({
    queryKey: ["my-certs", userId],
    queryFn: async () => {
      const res = await fetch("/api/compliance?scope=self");
      if (!res.ok) throw new Error("Failed to load certificates");
      return res.json();
    },
    enabled: !!userId,
    retry: 2,
    staleTime: 30_000,
  });

  const wwcc = certs.find((c) => c.type === "wwcc" && c.fileUrl);

  const handleSubmit = async ({
    file,
    expiryDate,
  }: {
    file: File;
    expiryDate: string | null;
  }) => {
    const { fileUrl, fileName } = await uploadFileSmart(file);

    const res = await fetch("/api/compliance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "wwcc",
        issueDate: new Date().toISOString().slice(0, 10),
        expiryDate,
        fileUrl,
        fileName,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Could not save the certificate");
    }

    queryClient.invalidateQueries({ queryKey: ["my-certs", userId] });
    queryClient.invalidateQueries({ queryKey: ["induction-readiness"] });
    toast({ description: "WWCC uploaded." });
  };

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted" />
            Working With Children Check
          </h3>
          <p className="text-xs text-muted mt-1">
            Required before you can be rostered or clock in.
          </p>
        </div>
        <Link
          href="/compliance"
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          All certificates
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {wwcc ? (
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-3">
          <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
          <p className="text-sm text-foreground">
            WWCC on file
            {wwcc.expiryDate && (
              <span className="text-muted">
                {" "}
                · expires {new Date(wwcc.expiryDate).toLocaleDateString("en-AU")}
              </span>
            )}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center">
          <AlertTriangle className="w-5 h-5 text-warning mx-auto mb-2" />
          <p className="text-sm text-foreground mb-3">No WWCC uploaded yet.</p>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white"
          >
            <Upload className="w-4 h-4" />
            Upload WWCC
          </button>
          <p className="text-xs text-muted mt-3">
            A clear photo of the card is fine — large photos are resized
            automatically.
          </p>
        </div>
      )}

      <StaffCertUploadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        typeLabel="WWCC"
        onSubmit={handleSubmit}
      />
    </div>
  );
}
