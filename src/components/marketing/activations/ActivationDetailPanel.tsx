"use client";

import { useState } from "react";
import type { ActivationRow } from "@/hooks/useActivations";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/Sheet";
import { LifecycleStepper } from "./LifecycleStepper";
import { Button } from "@/components/ui/Button";
import { CoordinatorTodoForm } from "@/components/marketing/coordinator-todos/CoordinatorTodoForm";
import { ActivationQrLink } from "./ActivationQrLink";
import { ExternalLink, Send } from "lucide-react";

interface ActivationDetailPanelProps {
  activation: ActivationRow | null;
  onClose: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  free_breakfast: "Free breakfast",
  parent_info_session: "Parent info session",
  expert_talk: "Expert talk",
  programme_taster: "Programme taster",
  holiday_quest_preview: "Holiday Quest preview",
  open_day: "Open day",
  community_event: "Community event",
  other: "Other",
};

function fmtDate(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

export function ActivationDetailPanel({ activation, onClose }: ActivationDetailPanelProps) {
  const [todoOpen, setTodoOpen] = useState(false);
  return (
    <Sheet open={!!activation} onOpenChange={(o) => !o && onClose()}>
      <SheetContent width="max-w-2xl" className="p-6 overflow-y-auto">
        {activation && (
          <>
            <SheetTitle className="text-base font-semibold pr-8">{activation.title}</SheetTitle>
            <SheetDescription className="text-xs text-muted">
              {activation.service.name} · {activation.activationType ? TYPE_LABEL[activation.activationType] ?? activation.activationType : "Type not set"}
            </SheetDescription>

            <div className="mt-5 space-y-6">
              <section>
                <h4 className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">Lifecycle</h4>
                <LifecycleStepper activation={activation} />
              </section>

              <section className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted">Scheduled</div>
                  <div className="font-medium">{fmtDate(activation.scheduledFor)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Term</div>
                  <div className="font-medium">
                    {activation.termYear && activation.termNumber ? `T${activation.termNumber} ${activation.termYear}` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted">Expected attendance</div>
                  <div className="font-medium">{activation.expectedAttendance ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Actual attendance</div>
                  <div className="font-medium">{activation.actualAttendance ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Enquiries generated</div>
                  <div className="font-medium">{activation.enquiriesGenerated ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Budget</div>
                  <div className="font-medium">{activation.budget ? `$${activation.budget.toFixed(0)}` : "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Coordinator</div>
                  <div className="font-medium">{activation.coordinator?.name ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Campaign</div>
                  <div className="font-medium">{activation.campaign.name}</div>
                </div>
              </section>

              <section>
                <h4 className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">Recap</h4>
                {activation.recapPostId ? (
                  <a
                    href={`/marketing?postId=${activation.recapPostId}`}
                    className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
                  >
                    Open MarketingPost ({activation.recapPostStatus})
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : activation.recapStatus === "overdue" ? (
                  <p className="text-sm text-red-700">Overdue — no recap published 7+ days after delivery.</p>
                ) : activation.recapStatus === "due_soon" ? (
                  <p className="text-sm text-amber-700">Recap due — Sprint 6 cron drafts one automatically 48h post-delivery.</p>
                ) : activation.recapStatus === "published" ? (
                  <p className="text-sm text-green-700">Published.</p>
                ) : (
                  <p className="text-sm text-muted">Not due until activation is delivered.</p>
                )}
              </section>

              {activation.notes && (
                <section>
                  <h4 className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">Notes</h4>
                  <pre className="whitespace-pre-wrap rounded-md border border-border bg-surface p-2 text-xs">
{activation.notes}
                  </pre>
                </section>
              )}

              <ActivationQrLink activationId={activation.id} serviceId={activation.service.id} title={activation.title} />

              <section>
                <h4 className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">Push a todo to {activation.service.name}&apos;s coordinator</h4>
                {todoOpen ? (
                  <div className="rounded-md border border-border bg-surface p-3">
                    <CoordinatorTodoForm
                      initialServiceIds={[activation.service.id]}
                      lockServices
                      activationId={activation.id}
                      initialTitle={`${activation.title} — coordinator action`}
                      initialDescription="Please action this for the upcoming activation. Reply in the todo when done."
                      onCreated={() => setTodoOpen(false)}
                      onCancel={() => setTodoOpen(false)}
                    />
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    iconLeft={<Send className="w-4 h-4" />}
                    onClick={() => setTodoOpen(true)}
                  >
                    Send to coordinator
                  </Button>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
