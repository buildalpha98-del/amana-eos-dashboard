"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useServices } from "@/hooks/useServices";
import {
  useCreateVendorBrief,
  useTransitionVendorBrief,
  useVendorContacts,
  type CreateBriefInput,
} from "@/hooks/useVendorBriefs";
import {
  TermReadinessCategory,
  VendorBriefType,
} from "@prisma/client";
import { toast } from "@/hooks/useToast";

const TYPE_OPTIONS: VendorBriefType[] = [
  "signage",
  "uniform",
  "print_collateral",
  "merchandise",
  "event_supplies",
  "other",
];

const TYPE_LABELS: Record<VendorBriefType, string> = {
  signage: "Signage",
  uniform: "Uniform",
  print_collateral: "Print collateral",
  merchandise: "Merchandise",
  event_supplies: "Event supplies",
  other: "Other",
};

const CATEGORY_OPTIONS: TermReadinessCategory[] = [
  "flyers",
  "banners",
  "signage",
  "holiday_programme_materials",
  "enrolment_posters",
  "other_print",
];

const CATEGORY_LABELS: Record<TermReadinessCategory, string> = {
  flyers: "Flyers",
  banners: "Banners",
  signage: "Signage",
  holiday_programme_materials: "Holiday programme materials",
  enrolment_posters: "Enrolment posters",
  other_print: "Other print",
};

export interface NewBriefPrefill {
  serviceId?: string | null;
  termYear?: number;
  termNumber?: number;
  termReadinessCategory?: TermReadinessCategory;
  type?: VendorBriefType;
}

/**
 * New Brief modal — used both standalone (+ New Brief CTA) and from
 * matrix-cell click (with prefill).
 */
export function NewBriefModal({
  open,
  onClose,
  prefill,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: NewBriefPrefill;
  onCreated?: (briefId: string) => void;
}) {
  const create = useCreateVendorBrief();
  const transition = useTransitionVendorBrief();
  const { data: services } = useServices();
  const { data: contacts } = useVendorContacts();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<VendorBriefType>(prefill?.type ?? "print_collateral");
  const [serviceId, setServiceId] = useState<string>(prefill?.serviceId ?? "");
  const [vendorContactId, setVendorContactId] = useState<string>("");
  const [briefBody, setBriefBody] = useState("");
  const [specifications, setSpecifications] = useState("");
  const [quantity, setQuantity] = useState<string>("");
  const [deliveryDeadline, setDeliveryDeadline] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [isTermReadiness, setIsTermReadiness] = useState(!!prefill?.termReadinessCategory);
  const [termYear, setTermYear] = useState<string>(prefill?.termYear ? String(prefill.termYear) : "");
  const [termNumber, setTermNumber] = useState<string>(prefill?.termNumber ? String(prefill.termNumber) : "");
  const [termCategory, setTermCategory] = useState<TermReadinessCategory>(
    prefill?.termReadinessCategory ?? "flyers",
  );

  // Reset form when modal opens with new prefill
  useEffect(() => {
    if (open) {
      setTitle("");
      setType(prefill?.type ?? "print_collateral");
      setServiceId(prefill?.serviceId ?? "");
      setVendorContactId("");
      setBriefBody("");
      setSpecifications("");
      setQuantity("");
      setDeliveryDeadline("");
      setDeliveryAddress("");
      setIsTermReadiness(!!prefill?.termReadinessCategory);
      setTermYear(prefill?.termYear ? String(prefill.termYear) : "");
      setTermNumber(prefill?.termNumber ? String(prefill.termNumber) : "");
      setTermCategory(prefill?.termReadinessCategory ?? "flyers");
    }
  }, [open, prefill]);

  // Default vendor contact to whichever has this type in defaultForTypes
  useEffect(() => {
    if (vendorContactId) return;
    if (!contacts) return;
    const match = contacts.find((c) => c.defaultForTypes.includes(type));
    if (match) setVendorContactId(match.id);
  }, [type, contacts, vendorContactId]);

  const submit = async (sendNow: boolean) => {
    if (!title.trim()) {
      toast({ variant: "destructive", description: "Title is required." });
      return;
    }

    const input: CreateBriefInput = {
      title: title.trim(),
      type,
      serviceId: serviceId || null,
      vendorContactId: vendorContactId || null,
      briefBody: briefBody.trim() || undefined,
      specifications: specifications.trim() || undefined,
      quantity: quantity ? Number(quantity) : undefined,
      deliveryAddress: deliveryAddress.trim() || undefined,
      deliveryDeadline: deliveryDeadline
        ? new Date(deliveryDeadline).toISOString()
        : undefined,
    };

    if (isTermReadiness) {
      if (!termYear || !termNumber) {
        toast({
          variant: "destructive",
          description: "Term year and number are required when term-readiness is on.",
        });
        return;
      }
      input.termYear = Number(termYear);
      input.termNumber = Number(termNumber);
      input.termReadinessCategory = termCategory;
    }

    try {
      const result = await create.mutateAsync(input);
      const briefId = result.brief.id;

      if (sendNow) {
        await transition.mutateAsync({
          id: briefId,
          toStatus: "brief_sent",
        });
        toast({ description: `${result.brief.briefNumber} created and marked sent.` });
      } else {
        toast({ description: `${result.brief.briefNumber} created as draft.` });
      }

      onCreated?.(briefId);
      onClose();
    } catch {
      // onMutationError handles the toast
    }
  };

  if (!open) return null;

  const isPending = create.isPending || transition.isPending;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div
          className="flex w-full max-w-2xl flex-col rounded-xl bg-card shadow-xl"
          style={{ maxHeight: "90vh" }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-labelledby="new-brief-title"
        >
          <div className="flex items-start justify-between border-b border-border px-6 py-4">
            <h2 id="new-brief-title" className="text-lg font-semibold">
              New Vendor Brief
            </h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
            <Field label="Title" required>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='e.g. "Greystanes — Term 2 enrolment posters"'
                className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Type" required>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as VendorBriefType)}
                  className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Centre">
                <select
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  <option value="">Portfolio (no specific centre)</option>
                  {(services ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Vendor contact">
                <select
                  value={vendorContactId}
                  onChange={(e) => setVendorContactId(e.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                >
                  <option value="">— None —</option>
                  {(contacts ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.company ? ` · ${c.company}` : ""}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Quantity">
                <input
                  type="number"
                  min={0}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </Field>

              <Field label="Delivery deadline">
                <input
                  type="date"
                  value={deliveryDeadline}
                  onChange={(e) => setDeliveryDeadline(e.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </Field>
            </div>

            <Field label="Specifications">
              <textarea
                value={specifications}
                onChange={(e) => setSpecifications(e.target.value)}
                rows={2}
                placeholder="Size, paper stock, colour count, finish..."
                className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </Field>

            <Field label="Delivery address">
              <textarea
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </Field>

            <Field label="Brief body" hint="Markdown supported. This is what gets pasted into your email/Teams message.">
              <textarea
                value={briefBody}
                onChange={(e) => setBriefBody(e.target.value)}
                rows={6}
                className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm font-mono focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </Field>

            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={isTermReadiness}
                onChange={(e) => setIsTermReadiness(e.target.checked)}
                className="h-4 w-4 rounded border-border text-brand"
              />
              <span>This is for term enrolment prep</span>
            </label>

            {isTermReadiness && (
              <div className="grid grid-cols-3 gap-3 rounded-md border border-border bg-surface/30 p-3">
                <Field label="Year">
                  <input
                    type="number"
                    value={termYear}
                    onChange={(e) => setTermYear(e.target.value)}
                    placeholder="2026"
                    className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm"
                  />
                </Field>
                <Field label="Term">
                  <select
                    value={termNumber}
                    onChange={(e) => setTermNumber(e.target.value)}
                    className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    <option value="1">Term 1</option>
                    <option value="2">Term 2</option>
                    <option value="3">Term 3</option>
                    <option value="4">Term 4</option>
                  </select>
                </Field>
                <Field label="Category">
                  <select
                    value={termCategory}
                    onChange={(e) => setTermCategory(e.target.value as TermReadinessCategory)}
                    className="w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-surface"
            >
              Cancel
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => submit(false)}
                disabled={isPending}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-surface disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save as draft"}
              </button>
              <button
                type="button"
                onClick={() => submit(true)}
                disabled={isPending}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & mark sent"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-foreground/80">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </label>
      {children}
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
