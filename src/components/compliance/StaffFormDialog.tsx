"use client";

/**
 * One staff compliance form (Staff Record / Responsible Person), filled in
 * and signed on screen (Daniel, 20 Oct 2026). The staff member edits their
 * own; everyone else allowed to see it gets a read-only copy, and the
 * nominated supervisor gets the countersign block on a submitted
 * Responsible Person form.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { SignaturePad } from "@/components/contracts/SignaturePad";
import { mutateApi } from "@/lib/fetch-api";
import { toast } from "@/hooks/useToast";

export type StaffFormStatus = "not_started" | "draft" | "awaiting_supervisor" | "complete";

export interface StaffFormView {
  type: "staff_record" | "responsible_person";
  title: string;
  status: StaffFormStatus;
  data: Record<string, unknown>;
  staffSignatureDataUrl: string | null;
  submittedAt: string | null;
  supervisorName: string | null;
  supervisorSignatureDataUrl: string | null;
  supervisorSignedAt: string | null;
  documentsViewed: string[];
}

export interface StaffFormsResponse {
  staff: { id: string; name: string | null; centreName: string | null };
  canEdit: boolean;
  canCountersign: boolean;
  documents: readonly { key: string; label: string }[];
  forms: StaffFormView[];
}

type Data = Record<string, unknown>;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "");

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:bg-surface disabled:text-foreground";

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="space-y-3 border-t border-border pt-4 first:border-0 first:pt-0">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-brand">{title}</h3>
      {note && <p className="text-xs text-muted leading-relaxed">{note}</p>}
      {children}
    </section>
  );
}

export function StaffFormDialog({
  open,
  onOpenChange,
  userId,
  form,
  meta,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  form: StaffFormView;
  meta: Omit<StaffFormsResponse, "forms">;
}) {
  const client = useQueryClient();
  const [data, setData] = useState<Data>(form.data);
  const [signature, setSignature] = useState<string | null>(null);
  const [supSignature, setSupSignature] = useState<string | null>(null);
  const [docs, setDocs] = useState<string[]>(form.documentsViewed);
  const [error, setError] = useState("");
  const editable = meta.canEdit;
  const isRp = form.type === "responsible_person";
  const set = (k: string, v: unknown) => setData((d) => ({ ...d, [k]: v }));
  const str = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "");

  const save = useMutation({
    mutationFn: (submit: boolean) =>
      mutateApi(`/api/staff-forms/${userId}/${form.type}`, {
        method: "PUT",
        body: { data, ...(submit ? { submit: true, signature: signature ?? undefined } : {}) },
      }),
    onSuccess: (_r, submit) => {
      client.invalidateQueries({ queryKey: ["staff-forms", userId] });
      toast({ description: submit ? `${form.title} submitted.` : "Draft saved." });
      if (submit) onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });
  const countersign = useMutation({
    mutationFn: () =>
      mutateApi(`/api/staff-forms/${userId}/${form.type}/countersign`, {
        method: "POST",
        body: { signature: supSignature, documentsViewed: docs },
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["staff-forms", userId] });
      toast({ description: "Signed as nominated supervisor." });
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const field = (k: string, label: string, opts: { type?: string; long?: boolean; hint?: string } = {}) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-foreground">{label}</span>
      {opts.long ? (
        <textarea className={inputCls} rows={3} value={str(k)} disabled={!editable} onChange={(e) => set(k, e.target.value)} />
      ) : (
        <input className={inputCls} type={opts.type ?? "text"} value={str(k)} disabled={!editable} onChange={(e) => set(k, e.target.value)} />
      )}
      {opts.hint && <span className="mt-1 block text-xs text-muted">{opts.hint}</span>}
    </label>
  );
  const check = (k: string, label: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4" checked={data[k] === true} disabled={!editable} onChange={(e) => set(k, e.target.checked)} />
      <span>{label}</span>
    </label>
  );
  const yesNo = (k: string, question: string, detailKey?: string) => (
    <div className="space-y-2 rounded-lg bg-surface p-3">
      <p className="text-sm text-foreground">{question}</p>
      <div className="flex gap-4 text-sm" role="radiogroup" aria-label={question}>
        {(["yes", "no"] as const).map((v) => (
          <label key={v} className="flex items-center gap-1.5">
            <input type="radio" name={k} checked={data[k] === v} disabled={!editable} onChange={() => set(k, v)} />
            {v === "yes" ? "Yes" : "No"}
          </label>
        ))}
      </div>
      {detailKey && data[k] === "yes" && field(detailKey, "Please give details", { long: true })}
    </div>
  );

  const staffRecord = (
    <>
      <Section title="Personal details">
        {field("fullName", "Full name")}
        {field("dateOfBirth", "Date of birth", { type: "date" })}
        {field("address", "Address")}
      </Section>
      <Section title="Qualifications and training">
        {field("qualifications", "Relevant qualification/s, or course enrolled in", { long: true })}
        {check("qualificationCopiesAttached", "Copies attached (uploaded to my compliance documents)")}
        {field("otherTraining", "Other approved training completed (including first aid training, GECCKO child safe training)", { long: true })}
        {check("trainingCopiesAttached", "Copies attached (uploaded to my compliance documents)")}
      </Section>
      <Section title="Working with Children Check">
        {field("wwccNumber", "Working with Children Check / Working with Vulnerable People number")}
        {field("wwccExpiry", "Expiry date", { type: "date" })}
      </Section>
      <Section title="Emergency contact">
        {field("emergencyName", "Name")}
        {field("emergencyRelationship", "Relationship")}
        {field("emergencyPhone", "Phone", { type: "tel" })}
      </Section>
    </>
  );

  const responsiblePerson = (
    <>
      <p className="text-sm text-muted leading-relaxed">
        The Education and Care Services National Regulations require a responsible person to be present at all times
        that the Service is educating and caring for children. To consent to the position of responsible person, you
        must be familiar with the requirements and obligations under the National Quality Framework (the Education and
        Care Services National Law and Regulations) and understand the roles and responsibilities of this position.
      </p>
      <Section title="Personal details">
        {field("fullName", "Full name")}
        {field("dateOfBirth", "Date of birth", { type: "date" })}
        {field("address", "Address")}
        {field("mobile", "Mobile phone number", { type: "tel" })}
        {field("email", "Email address", { type: "email" })}
        {yesNo("otherName", "Have you ever been known by a different name? (including maiden/married name)")}
        {data.otherName === "yes" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {field("otherFamilyName", "Family name")}
            {field("otherGivenName", "Given name")}
          </div>
        )}
      </Section>
      <Section title="Checks and training">
        {field("wwccNumber", "Working with Children Check number")}
        {field("wwccExpiry", "Expiry date", { type: "date" })}
        {field("childProtectionCourseNumber", "Child protection training course number")}
        {field("childSafetyTrainingDate", "Child safety training date of completion", { type: "date" })}
      </Section>
      <Section
        title="Fit and proper declaration"
        note="Only applicable for staff administering CCS. Educators and employees must declare they are fit and proper and have the capacity to comply with their obligations under the Family Assistance Law, and remain so during their employment — including matters of fraud, dishonesty and financial management."
      >
        {yesNo("fpConvictions", "Do you have any serious convictions or findings of guilt for offences punishable by a maximum of 2 years imprisonment, or relating to violence, sexual offences, fraud, stealing or dishonesty?")}
        {yesNo("fpBankruptcy", "Do you have any instances of bankruptcy, insolvency or external administration?")}
        {yesNo("fpDirectorAdministration", "Have you been a Director or Secretary of a corporation that went into administration, receivership or liquidation?")}
        {yesNo("fpConflictOfInterest", "Do you have any conflict of interest or financial interest in our service?")}
        {field("fpOtherInfo", "Any other information which may affect your fit and proper status under the Family Assistance Law", { long: true })}
      </Section>
      <Section title="Compliance history statement" note="Source: acecqa.gov.au">
        {yesNo("chDisciplinary", "1. Have you been subject to any compliance action or disciplinary proceedings in any Australian state or territory under the Education and Care Services National Law (including the Regulations), or any other relevant state or territory law (children's services, education, or former education and care laws)?", "chDisciplinaryDetails")}
        {yesNo("chProhibitionNotice", "2. Have you ever been subject to a prohibition, supervision or suspension notice under the Education and Care Services National Law?", "chProhibitionNoticeDetails")}
        {yesNo("chLicenceRefused", "3. Have you ever held or applied for a licence, approval, registration, certification or other authorisation under National Law which the regulatory authority refused, refused to renew, suspended or cancelled (nominated supervisor, person in day-to-day charge, person with management or control)?", "chLicenceRefusedDetails")}
      </Section>
      <Section
        title="Prohibition notice declaration"
        note="Under sections 187 and 188 of the Education and Care Services National Law, a person subject to a prohibition notice must not work for or be engaged by an education and care service. Penalties apply for false or misleading information."
      >
        {yesNo("pnCurrentProhibition", "Are you currently subject to a prohibition notice under the Education and Care Services National Law?", "pnCurrentProhibitionDetails")}
        {yesNo("pnRestricted", "Are you currently prohibited or restricted from working with children under any other law?", "pnRestrictedDetails")}
      </Section>
      <Section title="Declaration">
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          <li>The information provided in this form is true, complete and correct.</li>
          <li>I have read, understood and agree to the conditions in this form.</li>
          <li>I have read and understood my legal obligations under the Education and Care Services National Law and Regulations.</li>
          <li>The approved provider and the regulatory authority are authorised to verify any information provided.</li>
          <li>Some information may be disclosed to the Commonwealth for the Family Assistance Law, and to other persons or authorities where the law allows.</li>
          <li>I am aware penalties apply under the National Law if I provide false or misleading information.</li>
        </ul>
        {check(
          "declarationAccepted",
          `I, ${str("fullName") || "the person named above"}, make this declaration and accept the position of responsible person at ${meta.staff.centreName ?? "my centre"}.`,
        )}
      </Section>
    </>
  );

  const busy = save.isPending || countersign.isPending;
  const showCountersign = isRp && meta.canCountersign && !!form.submittedAt;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" className="print:static print:max-h-none print:shadow-none">
        <div className="space-y-5" id="staff-form-print">
          <div className="pr-8">
            <DialogTitle className="text-xl font-heading font-semibold tracking-tight text-foreground">{form.title}</DialogTitle>
            <DialogDescription className="text-sm text-muted mt-1">
              {meta.staff.name}
              {meta.staff.centreName ? ` · ${meta.staff.centreName}` : ""}
              {form.submittedAt ? ` · submitted ${fmt(form.submittedAt)}` : ""}
            </DialogDescription>
          </div>

          {editable && form.status === "complete" && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Already complete. Changing it means signing again{isRp ? ", and your supervisor countersigning again" : ""}.
            </p>
          )}

          <fieldset className="space-y-5" disabled={!editable}>
            {isRp ? responsiblePerson : staffRecord}
          </fieldset>

          <Section title="Signature">
            {form.staffSignatureDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.staffSignatureDataUrl} alt={`Signature of ${meta.staff.name ?? "staff member"}`} className="h-20 rounded border border-border bg-white" />
            )}
            {editable ? (
              <SignaturePad onChange={setSignature} label={form.staffSignatureDataUrl ? "Sign again to resubmit" : "Sign here to submit"} />
            ) : (
              !form.staffSignatureDataUrl && <p className="text-sm text-muted">Not signed yet.</p>
            )}
          </Section>

          {isRp && (
            <Section title="Nominated supervisor" note="Documents collected and viewed by management, and acceptance by the nominated supervisor.">
              <div className="space-y-2">
                {meta.documents.map((d) => (
                  <label key={d.key} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={docs.includes(d.key)}
                      disabled={!showCountersign}
                      onChange={(e) => setDocs((cur) => (e.target.checked ? [...cur, d.key] : cur.filter((x) => x !== d.key)))}
                    />
                    <span>{d.label}</span>
                  </label>
                ))}
              </div>
              {form.supervisorSignedAt ? (
                <div className="space-y-1 text-sm">
                  <p>
                    Signed by <strong>{form.supervisorName}</strong> on {fmt(form.supervisorSignedAt)}
                  </p>
                  {form.supervisorSignatureDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.supervisorSignatureDataUrl} alt={`Signature of ${form.supervisorName ?? "supervisor"}`} className="h-20 rounded border border-border bg-white" />
                  )}
                </div>
              ) : !showCountersign ? (
                <p className="text-sm text-muted">
                  {form.submittedAt ? "Waiting for the centre's coordinator or a State Manager to sign." : "Signed after the form is submitted."}
                </p>
              ) : null}
              {showCountersign && (
                <SignaturePad onChange={setSupSignature} label={form.supervisorSignedAt ? "Sign again as nominated supervisor" : "Sign as nominated supervisor"} />
              )}
            </Section>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4 print:hidden">
            <Button variant="ghost" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" aria-hidden />
              Print
            </Button>
            {editable && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => (setError(""), save.mutate(false))}>
                  Save draft
                </Button>
                <Button disabled={busy || !signature} onClick={() => (setError(""), save.mutate(true))}>
                  Sign and submit
                </Button>
              </>
            )}
            {showCountersign && (
              <Button disabled={busy || !supSignature} onClick={() => (setError(""), countersign.mutate())}>
                Sign as nominated supervisor
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
