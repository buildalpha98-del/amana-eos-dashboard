"use client";

import { useState } from "react";
import type { CreativeRequestStatus } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useEscapeClose } from "@/hooks/useEscapeClose";
import {
  STATUS_LABELS,
  TRANSITIONS,
  TYPE_LABELS,
} from "@/lib/creative-request/constants";
import {
  useCreativeRequest,
  usePatchRequest,
  usePostRequestMessage,
  useRequestMessages,
} from "@/hooks/useCreativeRequests";
import { useCampaigns } from "@/hooks/useMarketing";
import { ProofsSection } from "@/components/requests/ProofsSection";
import { Skeleton } from "@/components/ui/Skeleton";

export function RequestDetailPanel({
  requestId,
  fulfiller,
  currentUserId,
  onClose,
}: {
  requestId: string;
  fulfiller: boolean;
  currentUserId: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError } = useCreativeRequest(requestId);
  const { data: messagesData } = useRequestMessages(requestId);
  const patch = usePatchRequest();
  const postMessage = usePostRequestMessage();

  const [draft, setDraft] = useState("");
  const [internal, setInternal] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmOwnCancel, setConfirmOwnCancel] = useState(false);
  // Suspend the panel's Escape handler while either confirm dialog is open —
  // otherwise Escape would dismiss both layers at once.
  useEscapeClose(onClose, !confirmCancel && !confirmOwnCancel);

  const request = data?.request;
  const messages = messagesData?.messages ?? [];
  const checklist = request?.checklist ?? [];
  const isOwner = request?.requestedById === currentUserId;
  const canCancel =
    isOwner && !fulfiller && request && ["new", "briefed"].includes(request.status);
  const nextStatuses: CreativeRequestStatus[] = request
    ? TRANSITIONS[request.status] ?? []
    : [];

  function send() {
    if (!draft.trim()) return;
    postMessage.mutate(
      { id: requestId, body: draft.trim(), internal: fulfiller && internal },
      { onSuccess: () => setDraft("") },
    );
  }

  function toggleChecklistItem(index: number) {
    if (!request?.checklist) return;
    const next = request.checklist.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item,
    );
    patch.mutate({ id: requestId, checklist: next });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="bg-card w-full sm:max-w-xl h-full overflow-y-auto border-l border-border p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Request detail"
      >
        {isError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="text-sm text-muted">
              Request not found or no longer available
            </p>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : isLoading || !request ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-2xs font-mono text-muted">
                  {request.requestNumber} · {TYPE_LABELS[request.type]}
                  {request.service ? ` · ${request.service.name}` : ""}
                </div>
                <h2 className="text-xl font-heading font-semibold tracking-tight text-foreground mt-1">
                  {request.title}
                </h2>
                <div className="text-sm text-muted mt-1">
                  {STATUS_LABELS[request.status]} · due{" "}
                  {new Date(request.dueDate).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  })}
                  {request.requestedBy?.name ? ` · requested by ${request.requestedBy.name}` : ""}
                  {request.pausedAt ? " · ⏸ waiting on centre review" : ""}
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-foreground">
                ✕
              </button>
            </div>

            {fulfiller && nextStatuses.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {nextStatuses.map((s) => (
                  <Button
                    key={s}
                    variant={s === "cancelled" ? "destructive" : "secondary"}
                    onClick={() =>
                      s === "cancelled"
                        ? setConfirmCancel(true)
                        : patch.mutate({ id: requestId, status: s })
                    }
                    disabled={patch.isPending}
                  >
                    → {STATUS_LABELS[s]}
                  </Button>
                ))}
              </div>
            )}
            {canCancel && (
              <div className="mt-4">
                <Button
                  variant="destructive"
                  onClick={() => setConfirmOwnCancel(true)}
                  disabled={patch.isPending}
                >
                  Cancel request
                </Button>
              </div>
            )}

            <div className="mt-5 space-y-3">
              <section>
                <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">Purpose</h3>
                <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{request.purpose}</p>
              </section>
              {request.exactCopy && (
                <section>
                  <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">
                    Exact copy — paste verbatim
                  </h3>
                  <p className="text-sm text-foreground mt-1 whitespace-pre-wrap bg-surface rounded-lg p-3 border-l-2 border-accent">
                    {request.exactCopy}
                  </p>
                </section>
              )}
              {(request.sizeSpec || request.outputFormat) && (
                <section className="text-sm text-foreground">
                  <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">Specs</h3>
                  <p className="mt-1">
                    {[request.sizeSpec, request.outputFormat].filter(Boolean).join(" · ")}
                  </p>
                </section>
              )}
              {fulfiller ? (
                <CampaignLinkSection
                  requestId={requestId}
                  campaignId={request.campaignId}
                  disabled={
                    patch.isPending ||
                    ["delivered", "cancelled"].includes(request.status)
                  }
                />
              ) : (
                request.campaign && (
                  <section className="text-sm text-foreground">
                    <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">
                      Campaign
                    </h3>
                    <p className="mt-1">{request.campaign.name}</p>
                  </section>
                )
              )}
              {request.attachments.filter((a) => !a.messageId).length > 0 && (
                <section>
                  <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">Files</h3>
                  {request.attachments
                    .filter((a) => !a.messageId)
                    .map((a) => (
                      <a
                        key={a.id}
                        href={a.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-sm text-brand-light hover:underline mt-1 truncate"
                      >
                        📎 {a.fileName}
                      </a>
                    ))}
                </section>
              )}
            </div>

            {fulfiller && checklist.length > 0 && (
              <section className="mt-6">
                <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">
                  Checklist · {checklist.filter((c) => c.done).length}/
                  {checklist.length} done
                </h3>
                <div className="mt-2 space-y-1">
                  {checklist.map((item, i) => (
                    <label
                      key={`${item.label}-${i}`}
                      className="flex items-center gap-2 text-sm text-foreground cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => toggleChecklistItem(i)}
                        disabled={
                          patch.isPending ||
                          ["delivered", "cancelled"].includes(request.status)
                        }
                      />
                      <span className={item.done ? "line-through text-muted" : ""}>
                        {item.label}
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}

            <ProofsSection
              requestId={requestId}
              request={request}
              fulfiller={fulfiller}
              isOwner={isOwner}
            />

            <section className="mt-6">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">Thread</h3>
              <div className="space-y-3 mt-2">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg p-3 text-sm ${
                      m.internal
                        ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900"
                        : "bg-surface"
                    }`}
                  >
                    <div className="text-2xs text-muted">
                      <span className="font-semibold text-foreground">{m.author?.name ?? "—"}</span>{" "}
                      · {new Date(m.createdAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      {m.internal && (
                        <span className="ml-2 font-bold uppercase text-amber-700 dark:text-amber-400">Internal</span>
                      )}
                    </div>
                    <p className="text-foreground mt-1 whitespace-pre-wrap">{m.body}</p>
                    {m.attachments.map((a) => (
                      <a key={a.id} href={a.fileUrl} target="_blank" rel="noreferrer" className="block text-2xs text-brand-light hover:underline mt-1 truncate">
                        📎 {a.fileName}
                      </a>
                    ))}
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="text-sm text-muted">No comments yet.</p>
                )}
              </div>

              <div className="mt-3">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  placeholder="Write a reply…"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                />
                <div className="flex items-center justify-between mt-2">
                  {fulfiller ? (
                    <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={internal}
                        onChange={(e) => setInternal(e.target.checked)}
                      />
                      Internal note (team only)
                    </label>
                  ) : (
                    <span />
                  )}
                  <Button onClick={send} disabled={postMessage.isPending || !draft.trim()}>
                    Send
                  </Button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel this request?"
        description="The requester will be notified and the request can't be reopened."
        confirmLabel="Cancel request"
        variant="danger"
        loading={patch.isPending}
        onConfirm={() =>
          patch.mutate(
            {
              id: requestId,
              status: "cancelled",
              cancellationReason: "Cancelled by marketing team",
            },
            { onSuccess: () => setConfirmCancel(false) },
          )
        }
      />
      <ConfirmDialog
        open={confirmOwnCancel}
        onOpenChange={setConfirmOwnCancel}
        title="Cancel this request?"
        description="The marketing team will be notified and the request can't be reopened."
        confirmLabel="Cancel request"
        variant="danger"
        loading={patch.isPending}
        onConfirm={() =>
          patch.mutate(
            {
              id: requestId,
              status: "cancelled",
              cancellationReason: "Cancelled by requester",
            },
            { onSuccess: () => setConfirmOwnCancel(false) },
          )
        }
      />
    </div>
  );
}

/**
 * Fulfiller-only campaign link — its own component so the campaigns query
 * (role-gated to fulfiller roles server-side) never fires for requesters.
 */
function CampaignLinkSection({
  requestId,
  campaignId,
  disabled,
}: {
  requestId: string;
  campaignId: string | null;
  disabled: boolean;
}) {
  const { data: campaigns } = useCampaigns();
  const patch = usePatchRequest();

  return (
    <section>
      <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted">
        Campaign
      </h3>
      <select
        value={campaignId ?? ""}
        onChange={(e) =>
          patch.mutate({ id: requestId, campaignId: e.target.value || null })
        }
        disabled={disabled || patch.isPending}
        aria-label="Linked campaign"
        className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground disabled:opacity-50"
      >
        <option value="">No campaign</option>
        {campaigns?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </section>
  );
}
