"use client";

import { useState, useEffect } from "react";
import { OnboardingTour } from "./OnboardingTour";

export function OnboardingTourWrapper() {
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    // Only show if not completed before
    const completed = localStorage.getItem("onboarding-tour-complete");
    if (!completed) {
      // Delay slightly to let the page render
      const timer = setTimeout(() => setShowTour(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!showTour) return null;

  return (
    <OnboardingTour
      onComplete={() => {
        localStorage.setItem("onboarding-tour-complete", "true");
        setShowTour(false);
      }}
    />
  );
}
