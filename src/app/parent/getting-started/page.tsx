"use client";

import Link from "next/link";
import {
  Rocket,
  User,
  Stethoscope,
  FileText,
  UserCheck,
  Smartphone,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import {
  useParentOnboarding,
  useParentChildren,
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
  const { data: children } = useParentChildren();
  const markStep = useMarkOnboardingStep();

  if (isLoading) return <OnboardingSkeleton />;

  const progress = onboarding?.progress ?? {
    profile: false,
    medical: false,
    documents: false,
    pickups: false,
    installed: false,
  };

  const completedCount = onboarding?.completedCount ?? 0;
  const totalCount = onboarding?.totalCount ?? 5;
  const allDone = completedCount === totalCount;

  // Use first child for linking to child-specific pages
  const firstChild = children?.[0];

  const items: ChecklistItem[] = [
    {
      key: "profile",
      title: "Complete your profile",
      description: "Add your phone number and address so we can reach you.",
      icon: User,
      iconColor: "text-blue-500",
      href: "/parent/account",
    },
    {
      key: "medical",
      title: "Review medical details",
      description: "Check your child's allergies, conditions, and medications are up to date.",
      icon: Stethoscope,
      iconColor: "text-amber-500",
      href: firstChild ? `/parent/children/${firstChild.id}` : "/parent/children",
    },
    {
      key: "documents",
      title: "Upload immunisation record",
      description: "Upload your child's immunisation history or medical action plan.",
      icon: FileText,
      iconColor: "text-purple-500",
      href: firstChild ? `/parent/children/${firstChild.id}` : "/parent/children",
    },
    {
      key: "pickups",
      title: "Add an authorised pickup person",
      description: "Add someone who can collect your child from the centre.",
      icon: UserCheck,
      iconColor: "text-green-500",
      href: firstChild ? `/parent/children/${firstChild.id}` : "/parent/children",
    },
    {
      key: "installed",
      title: "Add the app to your phone",
      description: "Install the Amana Parents app for quick access from your home screen.",
      icon: Smartphone,
      iconColor: "text-[#004E64]",
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
        <h1 className="text-[24px] font-heading font-bold text-[color:var(--color-foreground)] mt-2 leading-tight">
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
                  <div className={cn("w-5 h-5 rounded-full border-2 shrink-0", "border-[#e8e4df]")} />
                  <p className="text-sm font-semibold text-[#1a1a2e]">{item.title}</p>
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
              className="flex items-center gap-3 bg-white/50 rounded-xl p-4 border border-[#e8e4df]/50"
            >
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
                <item.icon className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#7c7c8a] line-through">{item.title}</p>
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
