"use client";

/**
 * /financials/family-balances — parent contact log for outstanding
 * balances. Each row records a chase attempt (call/email/SMS) with
 * date, amount owing, outcome, and any follow-up notes. Logging a
 * "no answer" outcome auto-schedules a Todo for the next day so
 * nobody slips through the cracks.
 */

import { useMemo, useState } from "react";
import {
  DollarSign,
  Phone,
  Mail,
  MessageSquare,
  User as UserIcon,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Handshake,
  FileWarning,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  useFamilyBalanceContacts,
  useDeleteFamilyBalanceContact,
  type ContactMethod,
  type ContactOutcome,
  type FamilyBalanceContactListItem,
} from "@/hooks/useFamilyBalanceContacts";
import {
  NewFamilyBalanceContactModal,
  type FamilyBalanceModalPrefill,
} from "@/components/financials/NewFamilyBalanceContactModal";

const METHOD_META: Record<
  ContactMethod,
  { icon: typeof Phone; label: string; className: string }
> = {
  phone: { icon: Phone, label: "Phone", className: "text-blue-600 dark:text-blue-400" },
  email: { icon: Mail, label: "Email", className: "text-purple-600 dark:text-purple-400" },
  sms: {
    icon: MessageSquare,
    label: "SMS",
    className: "text-emerald-600 dark:text-emerald-400",
  },
  in_person: {
    icon: UserIcon,
    label: "In person",
    className: "text-amber-600 dark:text-amber-400",
  },
};

const OUTCOME_META: Record<
  ContactOutcome,
  { icon: typeof CheckCircle2; label: string; className: string }
> = {
  answered: {
    icon: CheckCircle2,
    label: "Answered",
    className:
      "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  },
  no_answer: {
    icon: Clock,
    label: "No answer",
    className:
      "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800",
  },
  promised_payment: {
    icon: Handshake,
    label: "Promised payment",
    className:
      "bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  },
  payment_plan: {
    icon: Handshake,
    label: "Payment plan",
    className:
      "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
  },
  disputed: {
    icon: FileWarning,
    label: "Disputed",
    className:
      "bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
  },
  other: {
    icon: AlertCircle,
    label: "Other",
    className: "bg-surface text-muted border-border",
  },
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function FamilyBalancesPage() {
  const { data, isLoading, error, refetch } = useFamilyBalanceContacts();
  // Modal state: either creating (with optional prefill from a same-account
  // clone) OR editing an existing contact. Never both — opening one closes
  // the other.
  const [modalMode, setModalMode] = useState<"closed" | "create" | "edit">(
    "closed",
  );
  const [editingContact, setEditingContact] =
    useState<FamilyBalanceContactListItem | null>(null);
  const [prefill, setPrefill] = useState<FamilyBalanceModalPrefill | null>(
    null,
  );

  const closeModal = () => {
    setModalMode("closed");
    setEditingContact(null);
    setPrefill(null);
  };
  const openCreate = () => {
    setEditingContact(null);
    setPrefill(null);
    setModalMode("create");
  };
  const openEdit = (contact: FamilyBalanceContactListItem) => {
    setPrefill(null);
    setEditingContact(contact);
    setModalMode("edit");
  };
  const openLogAnother = (seed: FamilyBalanceModalPrefill) => {
    setEditingContact(null);
    setPrefill(seed);
    setModalMode("create");
  };

  const contacts = data?.contacts ?? [];

  // 2026-07-23: when editing, gather the other contact attempts for
  // the SAME account (case-insensitive match). Passed to the modal so
  // it can render a "thread" view — every attempt for this family
  // lives in one file, clickable to swap focus.
  const siblingContacts = useMemo(() => {
    if (!editingContact) return [];
    const key = editingContact.accountName.trim().toLowerCase();
    return contacts.filter(
      (c) =>
        c.id !== editingContact.id &&
        c.accountName.trim().toLowerCase() === key,
    );
  }, [contacts, editingContact]);

  const summary = useMemo(() => {
    const totalOwing = contacts.reduce((sum, c) => sum + c.amountOwing, 0);
    const noAnswerCount = contacts.filter((c) => c.outcome === "no_answer").length;
    const uniqueAccounts = new Set(contacts.map((c) => c.accountName)).size;
    return { totalOwing, noAnswerCount, uniqueAccounts };
  }, [contacts]);

  return (
    <div data-v2="staff" className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Family Balances"
        description="Track parent contact attempts for outstanding balances. Log every call, email, or SMS — no-answer outcomes auto-generate a next-day follow-up todo."
        primaryAction={{
          label: "Log contact",
          icon: Plus,
          onClick: openCreate,
        }}
      />

      {error && (
        <ErrorState
          title="Couldn't load family balance contacts"
          error={error as Error}
          onRetry={refetch}
        />
      )}

      {!error && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted uppercase tracking-wide">
                  Total tracked outstanding
                </span>
                <DollarSign className="w-4 h-4 text-muted" />
              </div>
              <p className="mt-2 text-2xl font-heading font-semibold text-foreground">
                {formatCurrency(summary.totalOwing)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted uppercase tracking-wide">
                  Accounts contacted
                </span>
                <UserIcon className="w-4 h-4 text-muted" />
              </div>
              <p className="mt-2 text-2xl font-heading font-semibold text-foreground">
                {summary.uniqueAccounts}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted uppercase tracking-wide">
                  No-answer follow-ups
                </span>
                <Clock className="w-4 h-4 text-muted" />
              </div>
              <p className="mt-2 text-2xl font-heading font-semibold text-foreground">
                {summary.noAnswerCount}
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="No contacts logged yet"
              description="Log the first contact attempt to start tracking follow-ups. No-answer outcomes will auto-schedule a next-day todo."
              action={{ label: "Log contact", onClick: openCreate }}
            />
          ) : (
            <ContactsTable contacts={contacts} onRowClick={openEdit} />
          )}
        </>
      )}

      {modalMode !== "closed" && (
        <NewFamilyBalanceContactModal
          onClose={closeModal}
          existing={modalMode === "edit" ? editingContact : null}
          prefill={modalMode === "create" ? prefill : null}
          onLogAnotherAttempt={openLogAnother}
          siblingContacts={modalMode === "edit" ? siblingContacts : []}
          onSwitchTo={openEdit}
        />
      )}
    </div>
  );
}

function ContactsTable({
  contacts,
  onRowClick,
}: {
  contacts: FamilyBalanceContactListItem[];
  onRowClick: (contact: FamilyBalanceContactListItem) => void;
}) {
  const del = useDeleteFamilyBalanceContact();

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface/60 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide">
                Contacted
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide">
                Parent / Account
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide">
                Centre
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide">
                Contact
              </th>
              <th className="text-right px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide">
                Owing
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide">
                Method
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide">
                Outcome
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted text-xs uppercase tracking-wide">
                Follow-up
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {contacts.map((c) => {
              const method = METHOD_META[c.contactMethod];
              const outcome = OUTCOME_META[c.outcome];
              const MethodIcon = method.icon;
              const OutcomeIcon = outcome.icon;
              return (
                <tr
                  key={c.id}
                  onClick={() => onRowClick(c)}
                  className="hover:bg-surface/40 cursor-pointer"
                >
                  <td className="px-4 py-3 text-foreground/90 whitespace-nowrap">
                    {formatDate(c.contactedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-foreground font-medium">{c.parentName}</p>
                    <p className="text-xs text-muted">{c.accountName}</p>
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {c.service ? (
                      <span className="text-foreground/80">
                        {c.service.name}
                        {c.service.code && (
                          <span className="text-xs text-muted"> ({c.service.code})</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <div className="flex flex-col gap-0.5">
                      {c.mobileNumber && (
                        <a
                          href={`tel:${c.mobileNumber}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-brand"
                        >
                          {c.mobileNumber}
                        </a>
                      )}
                      {c.parentEmail && (
                        <a
                          href={`mailto:${c.parentEmail}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-brand text-xs truncate max-w-[16rem]"
                        >
                          {c.parentEmail}
                        </a>
                      )}
                      {!c.mobileNumber && !c.parentEmail && (
                        <span className="text-muted/50">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap">
                    {formatCurrency(c.amountOwing)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 ${method.className}`}
                    >
                      <MethodIcon className="w-3.5 h-3.5" />
                      <span className="text-xs">{method.label}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-2xs font-medium ${outcome.className}`}
                    >
                      <OutcomeIcon className="w-3 h-3" />
                      {outcome.label}
                    </span>
                    {c.outcomeNotes && (
                      <p className="mt-1 text-xs text-muted line-clamp-2 max-w-xs">
                        {c.outcomeNotes}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {c.followUpDate ? (
                      <div className="flex flex-col">
                        <span className="text-foreground/80">
                          {formatDate(c.followUpDate)}
                        </span>
                        {c.followUpTodo && (
                          <span
                            className={`text-2xs ${
                              c.followUpTodo.status === "complete"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            {c.followUpTodo.status === "complete"
                              ? "Done"
                              : "Todo pending"}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (
                          confirm(
                            `Delete this contact log for ${c.parentName}? The follow-up todo (if any) is left intact.`,
                          )
                        )
                          del.mutate(c.id);
                      }}
                      disabled={del.isPending}
                      className="p-1 rounded text-muted hover:text-danger hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40"
                      aria-label="Delete contact log"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
