"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Send, Workflow } from "lucide-react";
import {
  useFlowPreviews,
  useSendFlowPreviews,
  type FlowPreview,
  type FlowStepPreview,
} from "@/hooks/useSequences";
import { describeDelay, describeTrigger } from "@/lib/sequence-flow-labels";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { PageHeader } from "@/components/layout/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

const GROUPS: { type: FlowPreview["type"]; label: string; hint: string }[] = [
  { type: "parent_nurture", label: "Family journeys", hint: "Sent to parents as they move through the enquiry pipeline" },
  { type: "crm_outreach", label: "School outreach", hint: "Sent to school contacts as leads move through the CRM" },
];

export default function EmailFlowsPage() {
  const { data, isLoading, error, refetch } = useFlowPreviews();
  const [selected, setSelected] = useState<{ flowId: string; stepId: string } | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const selectStep = (flowId: string, stepId: string) => {
    setSelected({ flowId, stepId });
    // Single-column layout: the preview sits below every flow, so bring it up.
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      requestAnimationFrame(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const flows = useMemo(() => data?.flows ?? [], [data]);
  const missingCount = flows.reduce(
    (n, f) => n + f.steps.filter((s) => s.source === "missing").length,
    0,
  );
  const totalSteps = flows.reduce((n, f) => n + f.steps.length, 0);

  const active = useMemo(() => {
    const flow = selected ? flows.find((f) => f.id === selected.flowId) : flows[0];
    const step = flow?.steps.find((s) => s.id === selected?.stepId) ?? flow?.steps[0];
    return flow && step ? { flow, step } : null;
  }, [flows, selected]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <Breadcrumb items={[{ label: "CRM", href: "/crm" }, { label: "Email flows" }]} />

      <PageHeader
        title="Email flows"
        description="Every automated email families and schools receive, in the order they receive it"
        primaryAction={{
          label: "Send all to a colleague",
          icon: Send,
          onClick: () => setSendOpen(true),
        }}
      />

      {missingCount > 0 && (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <strong>{missingCount} email{missingCount === 1 ? " has" : "s have"} no content yet.</strong>{" "}
            Those steps are skipped when they fall due — attach a template in Marketing → Sequences to
            switch them on.
          </p>
        </div>
      )}

      {error ? (
        <ErrorState title="Failed to load email flows" error={error as Error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <Skeleton className="h-[480px] rounded-xl" />
          <Skeleton className="h-[480px] rounded-xl" />
        </div>
      ) : flows.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="No email flows yet"
          description="Sequences created in Marketing → Sequences appear here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* Flow list */}
          <div className="space-y-6">
            <p className="text-sm text-muted">
              {flows.length} flows · {totalSteps} emails · previews use sample names ({data?.sampleCentre}).
            </p>
            {GROUPS.map((group) => {
              const groupFlows = flows.filter((f) => f.type === group.type);
              if (groupFlows.length === 0) return null;
              return (
                <section key={group.type} className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
                    <p className="text-xs text-muted">{group.hint}</p>
                  </div>
                  {groupFlows.map((flow) => (
                    <FlowCard
                      key={flow.id}
                      flow={flow}
                      activeStepId={active?.flow.id === flow.id ? active.step.id : null}
                      onSelect={(stepId) => selectStep(flow.id, stepId)}
                    />
                  ))}
                </section>
              );
            })}
          </div>

          {/* Preview */}
          <div ref={previewRef} className="scroll-mt-4 lg:sticky lg:top-4 lg:self-start">
            {active && <StepPreview flow={active.flow} step={active.step} />}
          </div>
        </div>
      )}

      <SendDialog open={sendOpen} onOpenChange={setSendOpen} total={totalSteps + 1} />
    </div>
  );
}

function FlowCard({
  flow,
  activeStepId,
  onSelect,
}: {
  flow: FlowPreview;
  activeStepId: string | null;
  onSelect: (stepId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{flow.name}</h3>
          <p className="text-xs text-muted">
            Starts at: {describeTrigger(flow.triggerStage)} · {flow.activeEnrolments} active
          </p>
        </div>
        {!flow.isActive && (
          <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-2xs font-medium text-muted">
            Paused
          </span>
        )}
      </div>
      <ol className="divide-y divide-border">
        {flow.steps.map((step, i) => (
          <li key={step.id}>
            <button
              type="button"
              onClick={() => onSelect(step.id)}
              aria-current={activeStepId === step.id ? "true" : undefined}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface",
                activeStepId === step.id && "bg-surface",
              )}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-2xs font-semibold text-brand">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{step.subject}</span>
                <span className="block text-xs text-muted">{describeDelay(step.delayHours)}</span>
              </span>
              <SourceBadge source={step.source} />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SourceBadge({ source }: { source: FlowStepPreview["source"] }) {
  if (source === "default") return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium",
        source === "missing"
          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
          : "bg-surface text-muted",
      )}
    >
      {source === "missing" ? "Not configured" : "Custom"}
    </span>
  );
}

function StepPreview({ flow, step }: { flow: FlowPreview; step: FlowStepPreview }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="space-y-1 border-b border-border px-4 py-3">
        <p className="text-xs text-muted">
          {flow.name} · {describeDelay(step.delayHours)} · {describeTrigger(flow.triggerStage)}
        </p>
        <p className="text-sm font-semibold text-foreground">{step.subject}</p>
      </div>
      {/* sandbox="" — no scripts, no navigation out of the preview. */}
      <iframe
        title={`Preview of ${step.subject}`}
        srcDoc={step.html}
        sandbox=""
        className="h-[70vh] w-full border-0"
      />
    </div>
  );
}

function SendDialog({
  open,
  onOpenChange,
  total,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  total: number;
}) {
  const [to, setTo] = useState("");
  const send = useSendFlowPreviews();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    send.mutate(
      { to: to.trim() },
      {
        onSuccess: (res) => {
          if (res.suppressed) {
            toast({
              variant: "destructive",
              description: `${res.to} is on the suppression list (a past bounce or complaint), so nothing was delivered.`,
            });
            return;
          }
          toast({
            variant: res.failed.length ? "destructive" : undefined,
            description: res.failed.length
              ? `Sent ${res.sent} of ${res.total} to ${res.to}. ${res.failed.length} failed: ${res.failed[0].error}`
              : `Sent ${res.sent} emails to ${res.to}.`,
          });
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogTitle>Send every flow to a colleague</DialogTitle>
        <DialogDescription>
          Sends an overview plus each of the {total - 1} emails, marked [Preview], so they can read them
          in their own inbox. Staff accounts only — this never reaches families or schools.
        </DialogDescription>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Staff email</span>
            <input
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@amanaoshc.com.au"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </label>
          <p className="text-xs text-muted">Takes about {Math.ceil(total * 0.7)} seconds — sends are paced.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={send.isPending} iconLeft={<Send className="h-4 w-4" />}>
              Send {total} emails
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
