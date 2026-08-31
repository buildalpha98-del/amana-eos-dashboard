"use client";

import Link from "next/link";
import {
  Rocket,
  Smartphone,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import {
  useParentOnboarding,
  useMarkOnboardingStep,
  type OnboardingProgress,
} from "@/hooks/useParentPortal";
import { InstallPrompt } from "@/components/parent/InstallPrompt";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  key: keyof OnboardingProgress;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  href?: string;
  isInstallStep?: boolean;
}

export default function GettingStartedPage() {
  const { data: onboarding, isLoading } = useParentOnboarding();
  const markStep = useMarkOnboardingStep();

  if (isLoading) return <OnboardingSkeleton />;

  const progress = onboarding?.progress ?? {
    profile: false,
    medical: false,
    documents: false,
    pickups: false,
    installed: false,
  };

  // Single-item checklist now, so progress is simply "is it installed?".
  // Reading totalCount from the API would still say 5 and show a parent
  // "1 of 5" against a list of one.
  const totalCount = 1;
  const completedCount = onboarding?.progress?.installed ? 1 : 0;
  const allDone = completedCount === totalCount;

  /**
   * ONE step, deliberately.
   *
   * Daniel, 2026-07-30: adding the app to the home screen is the only
   * thing we actually need parents to do. The other four — complete your
   * profile, review medical details, upload immunisation, add a pickup
   * person — are all captured during enrolment now, so presenting them
   * again was asking families to redo work they'd already done, and a
   * checklist that can't be finished is worse than no checklist.
   */
  const items: ChecklistItem[] = [
    {
      key: "installed",
      title: "Add the app to your phone",
      description:
        "Install the Amana Parents app so it's one tap from your home screen — no login to remember.",
      icon: Smartphone,
      iconColor: "text-brand",
      isInstallStep: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/parent"
          className="inline-flex items-center gap-1 text-sm font-semibold text-[color:var(--color-brand)] hover:text-[color:var(--color-brand-light)] min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Home
        </Link>
        <h1 className="text-2xl font-heading font-bold text-[color:var(--color-foreground)] mt-2 leading-tight">
          Get Set Up
        </h1>
        <p className="text-sm text-[color:var(--color-muted)] mt-1">
          A few quick steps to get the most out of your portal.
        </p>
      </div>

      {/* Progress card */}
      <div className="warm-card">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
              allDone
                ? "bg-[color:var(--color-status-in-care-bg)]"
                : "bg-[color:var(--color-accent)]/20",
            )}
          >
            {allDone ? (
              <CheckCircle2 className="w-6 h-6 text-[color:var(--color-status-in-care-fg)]" />
            ) : (
              <Rocket className="w-6 h-6 text-[color:var(--color-brand)]" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-base font-heading font-bold text-[color:var(--color-foreground)]">
              {allDone
                ? "All done!"
                : `${completedCount} of ${totalCount} steps complete`}
            </p>
            <p className="text-xs text-[color:var(--color-muted)]">
              {allDone
                ? "You're all set up — welcome to Amana OSHC."
                : "Finish up when you have a minute."}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-[color:var(--color-cream-deep)] rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              allDone ? "bg-[color:var(--color-success)]" : "bg-[color:var(--color-brand)]",
            )}
            style={{ width: `${(completedCount / totalCount) * 100}%` }}
          />
        </div>
      </div>

      {/* Checklist items */}
      <div className="space-y-3">
        {items.map((item) => {
          const isDone = progress[item.key];

          if (item.isInstallStep && !isDone) {
            // Show install prompt inline
            return (
              <div key={item.key} className="space-y-2">
                <div className="flex items-center gap-3 px-1">
                  <div className={cn("w-5 h-5 rounded-full border-2 shrink-0", "border-border")} />
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                </div>
                <InstallPrompt
                  onInstalled={() => markStep.mutate({ installed: true })}
                />
              </div>
            );
          }

          if (item.href && !isDone) {
            return (
              <Link
                key={item.key}
                href={item.href}
                className="warm-card flex items-center gap-3 hover:shadow-[var(--shadow-warm-md)] transition-shadow"
              >
                <div className="w-5 h-5 rounded-full border-2 border-[color:var(--color-border)] shrink-0" />
                <div className="w-10 h-10 rounded-full bg-[color:var(--color-cream-deep)] flex items-center justify-center shrink-0">
                  <item.icon className={cn("w-5 h-5", item.iconColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[color:var(--color-foreground)]">
                    {item.title}
                  </p>
                  <p className="text-xs text-[color:var(--color-muted)] mt-0.5">
                    {item.description}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-[color:var(--color-muted)] shrink-0" />
              </Link>
            );
          }

          // Completed item
          return (
            <div
              key={item.key}
              className="flex items-center gap-3 bg-white/50 rounded-xl p-4 border border-border/50"
            >
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <div className="w-9 h-9 rounded-lg bg-green-50 dark:bg-green-950/40 flex items-center justify-center shrink-0">
                <item.icon className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-muted line-through">{item.title}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────

function OnboardingSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-5 w-16 mb-2" />
        <Skeleton className="h-8 w-40 mb-1" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      {[1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}
