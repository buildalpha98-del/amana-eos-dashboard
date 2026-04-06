"use client";

import { AlertTriangle, UtensilsCrossed } from "lucide-react";

interface MedicalAlertBadgeProps {
  child: {
    medicalConditions?: string[];
    dietaryRequirements?: string[];
    // Support legacy Json fields too
    medical?: Record<string, unknown> | null;
    dietary?: Record<string, unknown> | null;
  };
  compact?: boolean;
}

function getConditions(child: MedicalAlertBadgeProps["child"]): string[] {
  // Prefer new typed fields, fall back to legacy Json
  if (child.medicalConditions && child.medicalConditions.length > 0) {
    return child.medicalConditions;
  }
  if (child.medical) {
    const raw = child.medical.conditions ?? child.medical.medicalConditions;
    if (Array.isArray(raw)) return raw.map(String);
  }
  return [];
}

function getDietary(child: MedicalAlertBadgeProps["child"]): string[] {
  // Prefer new typed fields, fall back to legacy Json
  if (child.dietaryRequirements && child.dietaryRequirements.length > 0) {
    return child.dietaryRequirements;
  }
  if (child.dietary) {
    const raw = child.dietary.restrictions ?? child.dietary.dietaryRequirements ?? child.dietary.details;
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === "string" && raw.trim()) return [raw];
  }
  return [];
}

export function MedicalAlertBadge({ child, compact = false }: MedicalAlertBadgeProps) {
  const conditions = getConditions(child);
  const dietary = getDietary(child);

  if (conditions.length === 0 && dietary.length === 0) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {conditions.length > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-semibold">
            <AlertTriangle className="w-3 h-3" />
            Medical
          </span>
        )}
        {dietary.length > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 text-[10px] font-semibold">
            <UtensilsCrossed className="w-3 h-3" />
            Dietary
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {conditions.map((c) => (
        <span
          key={c}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium"
        >
          <AlertTriangle className="w-3 h-3" />
          {c}
        </span>
      ))}
      {dietary.map((d) => (
        <span
          key={d}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-medium"
        >
          <UtensilsCrossed className="w-3 h-3" />
          {d}
        </span>
      ))}
    </div>
  );
}
