"use client";

/**
 * The forms a family signs — shared by /parent/forms (the designated
 * place behind the action button) and My Centre → Documents, so the two
 * surfaces can't drift apart.
 *
 * Two shapes of form:
 *  - family-level: one typed-name signature covers the household.
 *  - per-child (a CWA, a medical consent): one signature PER CHILD,
 *    because "signed for Abdul" says nothing about his sister. The
 *    sign action renders once per unsigned child at that centre.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";
import { SectionLabel } from "@/components/parent/ui";
import { Skeleton } from "@/components/ui/Skeleton";

interface SignatureRow {
  signedName: string;
  signedAt: string;
  childId: string | null;
}

interface FormRow {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  dueDate: string | null;
  perChild: boolean;
  serviceName: string;
  signed: SignatureRow | null;
  signatures: SignatureRow[];
}

interface FamilyChild {
  id: string;
  firstName: string;
  serviceId: string | null;
}

export function useParentForms() {
  return useQuery<{ forms: FormRow[]; children: FamilyChild[] }>({
    queryKey: ["parent", "forms"],
    queryFn: () => fetchApi("/api/parent/forms"),
    retry: 1,
  });
}

/** Forms with at least one signature still owing from this family. */
export function outstandingFormCount(
  data: { forms: FormRow[]; children: FamilyChild[] } | undefined,
): number {
  if (!data) return 0;
  return data.forms.filter((f) => {
    if (!f.perChild) return !f.signed;
    const signedChildIds = new Set(
      f.signatures.map((s) => s.childId).filter(Boolean),
    );
    return data.children.some((c) => !signedChildIds.has(c.id));
  }).length;
}

export function ParentFormsList() {
  const qc = useQueryClient();
  const { data, isLoading } = useParentForms();
  const [signing, setSigning] = useState<{
    formId: string;
    childId: string | null;
  } | null>(null);
  const [name, setName] = useState("");

  const sign = useMutation({
    mutationFn: (body: {
      formId: string;
      signedName: string;
      childId?: string;
    }) => mutateApi("/api/parent/forms", { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["parent", "forms"] });
      setSigning(null);
      setName("");
      toast({ description: "Signed — thank you." });
    },
    onError: (e: Error) =>
      toast({ variant: "destructive", description: e.message }),
  });

  if (isLoading) {
    return <Skeleton className="h-32 w-full rounded-[var(--radius-lg)]" />;
  }

  const forms = data?.forms ?? [];
  const children = data?.children ?? [];

  if (forms.length === 0) {
    return (
      <div className="warm-card text-center py-8">
        <CheckCircle2 className="w-6 h-6 mx-auto text-[color:var(--color-muted)] mb-2" />
        <p className="text-sm text-[color:var(--color-muted)]">
          Nothing to sign — anything your centre sends will appear here.
        </p>
      </div>
    );
  }

  const signBox = (formId: string, childId: string | null) => (
    <div className="space-y-2 pt-1">
      <label
        htmlFor={`sign-${formId}-${childId ?? "family"}`}
        className="block text-xs font-medium text-[color:var(--color-muted)]"
      >
        Type your full name to sign
      </label>
      <input
        id={`sign-${formId}-${childId ?? "family"}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Aysha Khan"
        className="w-full px-3 py-2.5 border border-[color:var(--color-border)] rounded-lg text-base bg-white"
      />
      <div className="flex gap-2">
        <button
          onClick={() =>
            sign.mutate({
              formId,
              signedName: name.trim(),
              ...(childId ? { childId } : {}),
            })
          }
          disabled={sign.isPending || name.trim().length === 0}
          className="flex-1 py-2.5 rounded-xl bg-[color:var(--color-brand)] text-white text-sm font-semibold min-h-11 disabled:opacity-50"
        >
          {sign.isPending ? "Signing…" : "Sign"}
        </button>
        <button
          onClick={() => setSigning(null)}
          className="px-4 rounded-xl border border-[color:var(--color-border)] text-sm min-h-11"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {forms.map((f) => {
        const signedChildIds = new Set(
          f.signatures.map((s) => s.childId).filter(Boolean),
        );
        const fullysigned = f.perChild
          ? children.length > 0 &&
            children.every((c) => signedChildIds.has(c.id))
          : Boolean(f.signed);

        return (
          <div key={f.id} className="warm-card space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-[color:var(--color-foreground)]">
                {f.title}
              </p>
              {fullysigned && (
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
              )}
            </div>
            <p className="text-xs text-[color:var(--color-muted)]">
              {f.serviceName}
              {f.dueDate &&
                ` · needed by ${new Date(f.dueDate).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}`}
            </p>
            {f.description && (
              <p className="text-sm text-[color:var(--color-foreground)]/85 whitespace-pre-wrap">
                {f.description}
              </p>
            )}
            {f.fileUrl && (
              <a
                href={f.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-brand)] underline underline-offset-2 min-h-11"
              >
                <FileText className="w-4 h-4" />
                Read the document
              </a>
            )}

            {f.perChild ? (
              <div className="space-y-2">
                {children.map((c) => {
                  const childSig = f.signatures.find(
                    (s) => s.childId === c.id,
                  );
                  if (childSig) {
                    return (
                      <p
                        key={c.id}
                        className="text-xs text-[color:var(--color-muted)]"
                      >
                        ✓ Signed for <strong>{c.firstName}</strong> by{" "}
                        {childSig.signedName} on{" "}
                        {new Date(childSig.signedAt).toLocaleDateString(
                          "en-AU",
                          { day: "numeric", month: "long", year: "numeric" },
                        )}
                      </p>
                    );
                  }
                  return signing?.formId === f.id &&
                    signing?.childId === c.id ? (
                    <div key={c.id}>{signBox(f.id, c.id)}</div>
                  ) : (
                    <button
                      key={c.id}
                      onClick={() => setSigning({ formId: f.id, childId: c.id })}
                      className="w-full py-2.5 rounded-xl bg-[color:var(--color-brand)] text-white text-sm font-semibold min-h-11"
                    >
                      Sign for {c.firstName}
                    </button>
                  );
                })}
              </div>
            ) : f.signed ? (
              <p className="text-xs text-[color:var(--color-muted)]">
                Signed by {f.signed.signedName} on{" "}
                {new Date(f.signed.signedAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            ) : signing?.formId === f.id && signing?.childId === null ? (
              signBox(f.id, null)
            ) : (
              <button
                onClick={() => setSigning({ formId: f.id, childId: null })}
                className="w-full py-2.5 rounded-xl bg-[color:var(--color-brand)] text-white text-sm font-semibold min-h-11"
              >
                Sign this form
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Standalone heading + list, for pages that want the labelled block. */
export function ParentFormsSection() {
  return (
    <section className="space-y-3">
      <SectionLabel label="Forms to sign" />
      <ParentFormsList />
    </section>
  );
}
