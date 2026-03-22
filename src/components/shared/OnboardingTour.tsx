"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface TourStep {
  target: string | null;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="sidebar"]',
    title: "Navigation",
    description:
      "Use the sidebar to access all your tools \u2014 Rocks, To-Dos, Scorecard, and more.",
    position: "right",
  },
  {
    target: '[data-tour="quick-add"]',
    title: "Quick Add",
    description:
      "Tap here to quickly create a new Rock, To-Do, or Issue from anywhere.",
    position: "bottom",
  },
  {
    target: '[data-tour="search"]',
    title: "Search",
    description:
      "Press \u2318K to search across everything \u2014 pages, people, rocks, and more.",
    position: "bottom",
  },
  {
    target: '[data-tour="notifications"]',
    title: "Notifications",
    description: "Stay on top of assignments, approvals, and updates.",
    position: "bottom",
  },
  {
    target: null,
    title: "You\u2019re All Set!",
    description:
      "Explore the dashboard, check out Getting Started for role-specific tips, and use the feedback widget to report issues.",
    position: "bottom",
  },
];

interface OnboardingTourProps {
  onComplete: () => void;
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const currentStep = TOUR_STEPS[step];
  const isLastStep = step === TOUR_STEPS.length - 1;

  const measureTarget = useCallback(() => {
    if (!currentStep.target) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(currentStep.target);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [currentStep.target]);

  useEffect(() => {
    measureTarget();
    window.addEventListener("resize", measureTarget);
    window.addEventListener("scroll", measureTarget, true);
    return () => {
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget, true);
    };
  }, [measureTarget]);

  const goNext = useCallback(() => {
    if (isLastStep) {
      onComplete();
      return;
    }
    setTransitioning(true);
    setTimeout(() => {
      setStep((s) => s + 1);
      setTransitioning(false);
    }, 150);
  }, [isLastStep, onComplete]);

  const skip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        goNext();
      } else if (e.key === "Escape") {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, skip]);

  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect || !currentStep.target) {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    }

    const gap = 12;
    const style: React.CSSProperties = { position: "fixed" };

    switch (currentStep.position) {
      case "right":
        style.top = targetRect.top + targetRect.height / 2;
        style.left = targetRect.right + gap;
        style.transform = "translateY(-50%)";
        break;
      case "left":
        style.top = targetRect.top + targetRect.height / 2;
        style.right = window.innerWidth - targetRect.left + gap;
        style.transform = "translateY(-50%)";
        break;
      case "bottom":
        style.top = targetRect.bottom + gap;
        style.left = targetRect.left + targetRect.width / 2;
        style.transform = "translateX(-50%)";
        break;
      case "top":
        style.bottom = window.innerHeight - targetRect.top + gap;
        style.left = targetRect.left + targetRect.width / 2;
        style.transform = "translateX(-50%)";
        break;
    }

    return style;
  };

  const spotlightStyle: React.CSSProperties | undefined =
    targetRect && currentStep.target
      ? {
          position: "fixed",
          top: targetRect.top - 4,
          left: targetRect.left - 4,
          width: targetRect.width + 8,
          height: targetRect.height + 8,
          borderRadius: 8,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.3)",
          zIndex: 9998,
          pointerEvents: "none" as const,
          transition: "all 0.3s ease-in-out",
        }
      : undefined;

  return (
    <div className="fixed inset-0 z-[9997]">
      {/* Backdrop — only shown when there is no spotlight target */}
      {!spotlightStyle && (
        <div className="absolute inset-0 bg-black/30 transition-opacity duration-300" />
      )}

      {/* Spotlight cutout */}
      {spotlightStyle && <div style={spotlightStyle} />}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={getTooltipStyle()}
        className={`z-[9999] max-w-xs w-80 bg-card rounded-xl shadow-xl p-5 transition-opacity duration-150 ${
          transitioning ? "opacity-0" : "opacity-100"
        }`}
      >
        <h3 className="text-base font-semibold text-foreground mb-1">
          {currentStep.title}
        </h3>
        <p className="text-sm text-muted leading-relaxed mb-4">
          {currentStep.description}
        </p>

        {/* Step dots */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <span
                key={i}
                className={`block w-2 h-2 rounded-full transition-colors duration-200 ${
                  i === step ? "bg-brand" : "bg-border"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={skip}
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              Skip Tour
            </button>
            <button
              onClick={goNext}
              className="px-4 py-1.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors"
            >
              {isLastStep ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
