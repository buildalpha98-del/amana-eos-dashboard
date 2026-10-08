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
  Menu,
  ShieldCheck,
  Sun,
  Wallet,
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
  /** If true, only shown to leader-tier roles (member and above) */
  leaderOnly?: boolean;
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
    leaderOnly: true,
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
      "Tap the ? at the top of the screen any time — guides and FAQs, Ask Amana AI, this tour again, or send us feedback.",
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

// 2026-10-07: Educators (staff) get their own tour. The general one sold
// them a "central hub for managing centres", described sidebar sections
// they can't see, and taught ⌘K and "?" shortcuts that don't exist on a
// phone — which is where most of them meet it. Theirs is about THEM: pay,
// documents, clocking in, and the checklist waiting on My Portal.
const STAFF_STEPS: TourStepDef[] = [
  {
    title: "Welcome!",
    description:
      "This is your Amana staff portal — your pay, your roster, your documents and your training, all in one place. Here's a quick look around.",
    icon: LayoutDashboard,
    iconColor: "text-brand",
  },
  {
    title: "Your menu",
    description:
      "Your menu has three parts. Home is about you — shifts, pay & leave, training. My Centre is your centre's work — sign in/out, roll call, checklists, posts. Handbook holds the Staff Handbook, The Amana Way and our Proven Process.",
    icon: Menu,
    iconColor: "text-brand",
  },
  {
    title: "Upload your documents",
    description:
      "Your Working With Children Check, first aid and other certificates all go in one place — My Training & Compliance. Tap Upload and take a photo. That's it.",
    icon: ShieldCheck,
    iconColor: "text-brand",
  },
  {
    title: "Clock in on My Shifts",
    description:
      "When you arrive for a shift, open My Shifts to clock in — your week ahead is there too. Roll call and checklists are under My Centre.",
    icon: Sun,
    iconColor: "text-brand",
  },
  {
    title: "Pay and leave",
    description:
      "My Pay & Leave has your payslips, leave balance and leave requests, and your expense claims — one page, three tabs.",
    icon: Wallet,
    iconColor: "text-brand",
  },
  {
    title: "You're all set!",
    description:
      "Your home page shows a short checklist of what to do before your first shift. Work through it one step at a time — most take a couple of minutes.",
    icon: Rocket,
    iconColor: "text-brand",
  },
];

// Post coordinator-collapse: "leader-tier" = member and above. Director
// of Service (member) handles centre-level switching just like admins do.
const LEADER_ROLES = ["member", "admin", "head_office", "owner"];

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

// Re-exported from the pure module so the E2E helpers share the same
// constant without importing a React component into the Playwright runner.
export { TOUR_STORAGE_KEY } from "@/lib/tour-storage";

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
  const isLeader = LEADER_ROLES.includes(userRole);

  const isStaff = userRole === "staff";
  const steps = isStaff
    ? STAFF_STEPS
    : ALL_STEPS.filter((s) => !s.leaderOnly || isLeader);

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
      // Staff finish on My Portal, where their one checklist lives.
      router.push(isStaff ? "/my-portal" : "/getting-started");
      return;
    }
    animateTransition(() => setCurrentStep((s) => s + 1));
  }, [isLast, isStaff, onComplete, router, animateTransition]);

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
                    : "bg-border dark:bg-surface",
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
              {isLast ? (isStaff ? "Let's go" : "Get Started") : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
