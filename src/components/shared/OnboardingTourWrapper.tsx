"use client";

import { useState, useEffect } from "react";
import { WelcomeTour, TOUR_STORAGE_KEY } from "@/components/onboarding/WelcomeTour";

export function OnboardingTourWrapper() {
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    // Only show if not completed before
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed) {
      // Delay slightly to let the page render
      const timer = setTimeout(() => setShowTour(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!showTour) return null;

  return (
    <WelcomeTour
      onComplete={() => {
        localStorage.setItem(TOUR_STORAGE_KEY, "true");
        setShowTour(false);
      }}
    />
  );
}
