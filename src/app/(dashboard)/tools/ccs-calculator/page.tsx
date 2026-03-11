"use client";

import { CCSCalculator } from "@/components/shared/CCSCalculator";

export default function CCSCalculatorPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl border p-6">
        <CCSCalculator />
      </div>
    </div>
  );
}
