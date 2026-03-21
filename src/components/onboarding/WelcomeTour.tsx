"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  PanelLeft,
  Plus,
  Command,
  HelpCircle,
  Rocket,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Tour step definition
// ---------------------------------------------------------------------------

interface TourStepDef {
  title: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  /** If true, only shown to coordinator+ roles */
  coordinatorOnly?: boolean;
}

const ALL_STEPS: TourStepDef[] = [
  {
    title: "Welcome to Amana OSHC Dashboard!",
    description:
      "This is your central hub for managing centres, tracking goals, and staying on top of everything. Let us show you around — it only takes a minute.",
    icon: LayoutDashboard,
    iconColor: "text-brand",
  },
  {
    title: "Your Sidebar",
    description:
      "The sidebar on the left is your main navigation. It's organised into sections — Home, EOS, Operations, Growth, People, and Admin. Star any page to add it to your Favourites at the top for quick access.",
    icon: PanelLeft,
    iconColor: "text-blue-500",
  },
  {
    title: "Centre Switcher",
    description:
      "Use the dropdown in the header to quickly jump between your centres. You can filter data by service so you only see what's relevant to you.",
    icon: Building2,
    iconColor: "text-violet-500",
    coordinatorOnly: true,
  },
  {
    title: "Quick Actions",
    description:
      "See the + button in the top bar? Tap it to quickly create to-dos, log incidents, add rocks, or start other actions — all without leaving your current page.",
    icon: Plus,
    iconColor: "text-emerald-500",
  },
  {
    title: "Command Palette",
    description:
      "Press \u2318K (or Ctrl+K on Windows) to open the command palette. Search for anything — people, services, pages, or tasks — and jump there instantly.",
    icon: Command,
    iconColor: "text-orange-500",
  },
  {
    title: "Get Help Anytime",
    description:
      "Press ? to see all keyboard shortcuts. Visit the Help Centre for guides, FAQs, and video walkthroughs tailored to your role.",
    icon: HelpCircle,
    iconColor: "text-sky-500",
  },
  {
    title: "You're All Set!",
    description:
      "Head to the Getting Started checklist for a personalised setup guide based on your role. It will walk you through everything you need to do first.",
    icon: Rocket,
    iconColor: "text-brand",
  },
];

const COORDINATOR_PLUS_ROLES = [
  "coordinator",
  "admin",
  "head_office",
  "owner",
];

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

export const TOUR_STORAGE_KEY = "amana-tour-completed";

// ---------------------------------------------------------------------------
// WelcomeTour component
// ---------------------------------------------------------------------------

interface WelcomeTourProps {
  onComplete: () => void;
}

export function WelcomeTour({ onComplete }: WelcomeTourProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  // Build steps filtered by role
  const userRole = (session?.user as { role?: string } | undefined)?.role ?? "";
  const isCoordinatorPlus = COORDINATOR_PLUS_ROLES.includes(userRole);

  const steps = ALL_STEPS.filter(
    (s) => !s.coordinatorOnly || isCoordinatorPlus,
  );

  const step = steps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;
  const Icon = step.icon;

  const firstName =
    (session?.user?.name ?? "").split(" ")[0] || "there";

  const animateTransition = useCallback(
    (cb: () => void) => {
      setTransitioning(true);
      setTimeout(() => {
        cb();
        setTransitioning(false);
      }, 150);
    },
    [],
  );

  const goNext = useCallback(() => {
    if (isLast) {
      onComplete();
      router.push("/getting-started");
      return;
    }
    animateTransition(() => setCurrentStep((s) => s + 1));
  }, [isLast, onComplete, router, animateTransition]);

  const goBack = useCallback(() => {
    if (isFirst) return;
    animateTransition(() => setCurrentStep((s) => s - 1));
  }, [isFirst, animateTransition]);

  const skip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      } else if (e.key === "Escape") {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goBack, skip]);

  return (
    <div className="fixed inset-0 z-[9997] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={skip}
      />

      {/* Card */}
      <div
        className={cn(
          "relative z-[9999] w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl p-8 transition-opacity duration-150",
          transitioning ? "opacity-0" : "opacity-100",
        )}
      >
        {/* Step counter */}
        <div className="text-xs font-medium text-foreground/50 mb-4">
          Step {currentStep + 1} of {steps.length}
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center">
            <Icon className={cn("w-8 h-8", step.iconColor)} />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-lg font-bold text-foreground text-center mb-2">
          {currentStep === 0
            ? `Welcome, ${firstName}!`
            : step.title}
        </h2>

        {/* Description */}
        <p className="text-sm text-foreground/70 text-center leading-relaxed mb-6">
          {step.description}
        </p>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mb-6">
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn(
                "block w-2 h-2 rounded-full transition-colors duration-200",
                i === currentStep
                  ? "bg-brand"
                  : i < currentStep
                    ? "bg-brand/40"
                    : "bg-gray-200 dark:bg-gray-700",
              )}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={skip}
            className="text-xs text-foreground/40 hover:text-foreground/60 transition-colors py-2"
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={goBack}
                className="px-4 py-2 text-sm font-medium text-foreground/70 hover:text-foreground bg-surface rounded-lg transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={goNext}
              className="px-5 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
            >
              {isLast ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
