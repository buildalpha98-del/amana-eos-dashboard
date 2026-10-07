"use client";

/**
 * "Key policies" on My Training (2026-10-08, Daniel): the policies every new
 * starter must read and sign before their first shift — the Code of
 * Conduct and the Privacy Policy by default. Each opens a short,
 * plain-English version (src/lib/key-policy-summaries.ts, or the admin's own
 * summary), links the full policy, and is signed with the existing
 * per-version acknowledgement — so the records, the induction gate and the
 * get-ready checklist all agree.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { CheckCircle2, ChevronRight, ExternalLink, FileSignature } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";

interface KeyPolicy {
  id: string;
  title: string;
  summary: string | null;
  versionId: string | null;
  signedAt: string | null;
}

export function KeyPoliciesSection() {
  const { data } = useQuery<{ policies: KeyPolicy[] }>({
    queryKey: ["key-policies"],
    queryFn: () => fetchApi("/api/policies/key"),
    staleTime: 30_000,
    retry: 2,
  });
  const [open, setOpen] = useState<KeyPolicy | null>(null);

  const policies = data?.policies ?? [];
  if (policies.length === 0) return null;
  const left = policies.filter((p) => !p.signedAt).length;

  return (
    <section id="key-policies" className="scroll-mt-24" data-testid="key-policies">
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Key policies</h3>
      <p className="mb-3 text-sm text-muted">
        {left
          ? `Read the short version of ${left === 1 ? "this policy" : "these policies"} and sign before your first shift.`
          : "All signed — thank you."}
      </p>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {policies.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setOpen(p)}
              className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface transition-colors"
            >
              {p.signedAt ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
              ) : (
                <FileSignature className="h-5 w-5 shrink-0 text-brand" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{p.title}</span>
                <span className="block text-xs text-muted">
                  {p.signedAt
                    ? `Signed ${new Date(p.signedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
                    : "About 3 minutes to read · signature needed"}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {open && <SignDialog policy={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function SignDialog({ policy, onClose }: { policy: KeyPolicy; onClose: () => void }) {
  const qc = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const sign = useMutation({
    mutationFn: () => mutateApi(`/api/policies/${policy.id}/acknowledge`, { method: "POST" }),
    onSuccess: () => {
      for (const key of [["key-policies"], ["get-ready"], ["policies"], ["induction-readiness"], ["my-portal"]]) {
        qc.invalidateQueries({ queryKey: key });
      }
      toast({ description: `Signed — ${policy.title}` });
      onClose();
    },
    onError: (err: Error) => toast({ variant: "destructive", description: err.message }),
  });
  const fullPolicy = `/api/policies/${policy.id}/file?v=${policy.versionId ?? "current"}`;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg" className="max-h-[90vh] flex flex-col p-0">
        <header className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base font-semibold text-foreground">{policy.title}</DialogTitle>
          <p className="text-xs text-muted mt-0.5">The short version — what this means for you day to day.</p>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-foreground/90 leading-relaxed">
          {policy.summary ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeSanitize]}
              components={{
                h3: (props) => <h4 className="mt-4 mb-1.5 font-semibold text-brand" {...props} />,
                ul: (props) => <ul className="list-disc pl-5 space-y-1" {...props} />,
                p: (props) => <p className="mb-2" {...props} />,
              }}
            >
              {policy.summary}
            </ReactMarkdown>
          ) : (
            <p>Please read the full policy below before you sign.</p>
          )}
          <a
            href={fullPolicy}
            target="_blank"
            rel="noopener"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Read the full policy
          </a>
        </div>
        <footer className="border-t border-border px-5 py-4 space-y-3">
          {policy.signedAt ? (
            <p className="text-sm text-success flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              You signed this on{" "}
              {new Date(policy.signedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}.
            </p>
          ) : (
            <>
              <label className="flex items-start gap-2.5 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 rounded"
                />
                <span>
                  I have read and understand the {policy.title}, and I agree to follow it. I know the full
                  policy applies, not just this summary.
                </span>
              </label>
              <Button
                className="w-full"
                onClick={() => sign.mutate()}
                disabled={!agreed || sign.isPending}
              >
                {sign.isPending ? "Signing…" : "Sign"}
              </Button>
            </>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
