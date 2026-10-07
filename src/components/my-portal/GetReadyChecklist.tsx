"use client";

import Link from "next/link";
import { CheckCircle2, ChevronRight, Circle, Clock, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import {
  buildGetReadySteps,
  isNewStarter,
  type GetReadyInput,
  type GetReadyStep,
} from "@/lib/get-ready-steps";

/**
 * The one onboarding list on /my-portal — see src/lib/get-ready-steps.ts.
 * Renders nothing once every step is done, so a settled educator's home
 * page carries no onboarding furniture at all.
 */
export function GetReadyChecklist() {
  // Everything the steps need, in one request (GET /api/my-portal/get-ready).
  const { data } = useQuery<GetReadyInput>({
    queryKey: ["get-ready"],
    queryFn: () => fetchApi<GetReadyInput>("/api/my-portal/get-ready"),
    staleTime: 30_000,
    retry: 1,
    meta: { suppressGlobalErrorToast: true },
  });
  if (!data) return null;

  const steps = buildGetReadySteps(data);
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  const newStarter = isNewStarter(data.status);
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <section
      className="bg-card rounded-xl border border-border overflow-hidden"
      data-testid="get-ready-checklist"
      aria-labelledby="get-ready-title"
    >
      <div className="bg-brand px-5 py-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="get-ready-title"
              className="text-lg font-heading font-semibold tracking-tight flex items-center gap-2"
            >
              <Rocket className="w-5 h-5 text-accent" aria-hidden />
              {newStarter
                ? "Get ready for your first shift"
                : "Finish setting up your account"}
            </h2>
            <p className="text-sm text-white/80 mt-0.5">
              {newStarter
                ? "Work through these in order — most take a couple of minutes."
                : "A few things are still missing from your account."}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-accent">
            {doneCount} of {steps.length}
          </span>
        </div>
        <div
          className="mt-3 h-2 rounded-full bg-white/15 overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Setup progress"
        >
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <ol className="divide-y divide-border">
        {steps.map((step, i) => (
          <StepRow key={step.key} step={step} number={i + 1} />
        ))}
      </ol>
    </section>
  );
}

function StepRow({ step, number }: { step: GetReadyStep; number: number }) {
  const body = (
    <>
      <span className="shrink-0 mt-0.5" aria-hidden>
        {step.done ? (
          <CheckCircle2 className="w-5 h-5 text-success" />
        ) : step.waiting ? (
          <Clock className="w-5 h-5 text-muted" />
        ) : (
          <Circle className="w-5 h-5 text-brand" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-semibold",
            step.done ? "text-muted line-through" : "text-foreground",
          )}
        >
          <span className="sr-only">
            Step {number}
            {step.done ? " (done)" : ""}:{" "}
          </span>
          {step.label}
        </span>
        <span className="block text-xs text-muted mt-0.5">{step.hint}</span>
      </span>
      {step.href && !step.done && (
        <ChevronRight className="w-4 h-4 text-muted shrink-0 self-center" aria-hidden />
      )}
    </>
  );

  const rowClass = "flex items-start gap-3 px-5 py-3.5";
  return (
    <li>
      {step.href && !step.done ? (
        <Link
          href={step.href}
          className={cn(rowClass, "hover:bg-surface/60 transition-colors")}
        >
          {body}
        </Link>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
    </li>
  );
}
