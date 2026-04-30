"use client";

import { useState, useEffect } from "react";
import { Loader2, Save, AlertTriangle, UtensilsCrossed, Syringe } from "lucide-react";
import { useChildMedical, useUpdateChildMedical } from "@/hooks/useChildProfile";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

/** Format an ISO date (or null) for an `<input type="date">` (YYYY-MM-DD). */
function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/** Convert an empty date input to null, otherwise to ISO at start-of-day UTC. */
function dateInputToIso(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

const COMMON_CONDITIONS = [
  "Asthma",
  "Anaphylaxis",
  "Diabetes",
  "Epilepsy",
  "ADHD",
  "Autism",
];

const COMMON_DIETARY = [
  "Halal",
  "Vegetarian",
  "Vegan",
  "Nut Free",
  "Dairy Free",
  "Gluten Free",
  "Egg Free",
];

function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  icon,
  color,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  icon: React.ReactNode;
  color: "red" | "amber";
}) {
  const colorMap = {
    red: {
      selected: "bg-red-100 text-red-700 border-red-300",
      unselected: "bg-card text-muted border-border hover:border-red-200 hover:bg-red-50",
    },
    amber: {
      selected: "bg-amber-100 text-amber-700 border-amber-300",
      unselected: "bg-card text-muted border-border hover:border-amber-200 hover:bg-amber-50",
    },
  };

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {icon}
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                isSelected ? colorMap[color].selected : colorMap[color].unselected
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ChildMedicalTab({ childId }: { childId: string }) {
  const { data, isLoading, error } = useChildMedical(childId);
  const updateMedical = useUpdateChildMedical();

  const [conditions, setConditions] = useState<string[]>([]);
  const [medicationDetails, setMedicationDetails] = useState("");
  const [anaphylaxisPlan, setAnaphylaxisPlan] = useState(false);
  const [dietary, setDietary] = useState<string[]>([]);
  const [additionalNeeds, setAdditionalNeeds] = useState("");
  const [nextImmunisationDue, setNextImmunisationDue] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setConditions(data.medicalConditions);
      setMedicationDetails(data.medicationDetails ?? "");
      setAnaphylaxisPlan(data.anaphylaxisActionPlan);
      setDietary(data.dietaryRequirements);
      setAdditionalNeeds(data.additionalNeeds ?? "");
      setNextImmunisationDue(isoToDateInput(data.nextImmunisationDue));
      setDirty(false);
    }
  }, [data]);

  const toggleCondition = (c: string) => {
    setConditions((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
    setDirty(true);
  };

  const toggleDietary = (d: string) => {
    setDietary((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
    setDirty(true);
  };

  const handleSave = () => {
    updateMedical.mutate({
      childId,
      medicalConditions: conditions,
      medicationDetails: medicationDetails.trim() || null,
      anaphylaxisActionPlan: anaphylaxisPlan,
      dietaryRequirements: dietary,
      additionalNeeds: additionalNeeds.trim() || null,
      nextImmunisationDue: dateInputToIso(nextImmunisationDue),
    });
    setDirty(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-6 p-4">
      {/* Medical Conditions */}
      <MultiSelect
        label="Medical Conditions"
        options={COMMON_CONDITIONS}
        selected={conditions}
        onToggle={toggleCondition}
        icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
        color="red"
      />

      {/* Anaphylaxis Action Plan */}
      {conditions.includes("Anaphylaxis") && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={anaphylaxisPlan}
            onChange={(e) => {
              setAnaphylaxisPlan(e.target.checked);
              setDirty(true);
            }}
            className="rounded border-border text-brand focus:ring-brand"
          />
          <span className="text-foreground">Anaphylaxis Action Plan on file</span>
        </label>
      )}

      {/* Medication Details */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Medication Details</label>
        <textarea
          value={medicationDetails}
          onChange={(e) => {
            setMedicationDetails(e.target.value);
            setDirty(true);
          }}
          placeholder="Medications, dosage, and administration instructions..."
          rows={3}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
        />
      </div>

      {/* Next immunisation due */}
      <div className="space-y-2">
        <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Syringe className="w-4 h-4 text-blue-500" />
          Next Immunisation Due
        </label>
        <input
          type="date"
          value={nextImmunisationDue}
          onChange={(e) => {
            setNextImmunisationDue(e.target.value);
            setDirty(true);
          }}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-brand focus:border-transparent"
        />
        <p className="text-xs text-muted">
          Set when staff have reviewed the child&apos;s immunisation history. Drives reminder alerts.
        </p>
      </div>

      <hr className="border-border" />

      {/* Dietary Requirements */}
      <MultiSelect
        label="Dietary Requirements"
        options={COMMON_DIETARY}
        selected={dietary}
        onToggle={toggleDietary}
        icon={<UtensilsCrossed className="w-4 h-4 text-amber-500" />}
        color="amber"
      />

      {/* Additional Needs */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Additional Needs</label>
        <textarea
          value={additionalNeeds}
          onChange={(e) => {
            setAdditionalNeeds(e.target.value);
            setDirty(true);
          }}
          placeholder="Any other care requirements..."
          rows={3}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
        />
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={!dirty || updateMedical.isPending}
        className="flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {updateMedical.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        Save Changes
      </button>
    </div>
  );
}
