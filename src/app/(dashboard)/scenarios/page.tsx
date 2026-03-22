"use client";

import { useState, useMemo, useCallback } from "react";
import { Calculator, GitCompareArrows, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_INPUTS,
  calculateScenario,
  type ScenarioInputs,
} from "@/lib/scenario-engine";
import { useScenarios } from "@/hooks/useScenarios";
import { ScenarioInputPanel } from "@/components/scenarios/ScenarioInputPanel";
import { ScenarioOutputPanel } from "@/components/scenarios/ScenarioOutputPanel";
import { ScenarioComparisonView } from "@/components/scenarios/ScenarioComparisonView";
import { SavedScenariosView } from "@/components/scenarios/SavedScenariosView";
import { SaveScenarioDialog } from "@/components/scenarios/SaveScenarioDialog";
import { ErrorState } from "@/components/ui/ErrorState";

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "modeller" as const, label: "Modeller", icon: Calculator },
  { key: "comparison" as const, label: "Compare", icon: GitCompareArrows },
  { key: "saved" as const, label: "Saved", icon: FolderOpen },
];

type TabKey = (typeof TABS)[number]["key"];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ScenariosPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("modeller");
  const [inputs, setInputs] = useState<ScenarioInputs>({ ...DEFAULT_INPUTS });
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const outputs = useMemo(() => calculateScenario(inputs), [inputs]);

  const { data: savedScenarios = [], isLoading: scenariosLoading, error, refetch } = useScenarios();

  const handleInputChange = useCallback((key: keyof ScenarioInputs, value: number) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleLoadPreset = useCallback((presetInputs: ScenarioInputs) => {
    setInputs({ ...presetInputs });
  }, []);

  const handleLoadFromSaved = useCallback((savedInputs: ScenarioInputs) => {
    setInputs({ ...savedInputs });
    setActiveTab("modeller");
  }, []);

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#004E6415", color: "#004E64" }}
            >
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">Scenario Modelling</h2>
              <p className="text-sm text-muted mt-0.5">
                What-if analysis — adjust inputs and see real-time financial projections
              </p>
            </div>
          </div>
        </div>
        <ErrorState
          title="Failed to load scenarios"
          error={error as Error}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "#004E6415", color: "#004E64" }}
          >
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">Scenario Modelling</h2>
            <p className="text-sm text-muted mt-0.5">
              What-if analysis — adjust inputs and see real-time financial projections
            </p>
          </div>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-1 bg-surface rounded-lg p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "bg-card text-brand shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "modeller" && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Inputs */}
          <div className="lg:col-span-2">
            <ScenarioInputPanel
              inputs={inputs}
              onChange={handleInputChange}
              onLoadPreset={handleLoadPreset}
              onSave={() => setShowSaveDialog(true)}
            />
          </div>
          {/* Outputs */}
          <div className="lg:col-span-3">
            <ScenarioOutputPanel outputs={outputs} />
          </div>
        </div>
      )}

      {activeTab === "comparison" && (
        <ScenarioComparisonView savedScenarios={savedScenarios} />
      )}

      {activeTab === "saved" && (
        <SavedScenariosView
          scenarios={savedScenarios}
          isLoading={scenariosLoading}
          onLoad={handleLoadFromSaved}
        />
      )}

      {/* Save Dialog */}
      <SaveScenarioDialog
        open={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        inputs={inputs}
        outputs={outputs}
      />
    </div>
  );
}
