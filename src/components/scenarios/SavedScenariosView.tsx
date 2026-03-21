"use client";

import { Clock, Trash2, ArrowRight, Calculator } from "lucide-react";
import { useDeleteScenario, type SavedScenario } from "@/hooks/useScenarios";
import { formatAUD, type ScenarioInputs, type ScenarioOutputs } from "@/lib/scenario-engine";
import { toast } from "@/hooks/useToast";
import { EmptyState } from "@/components/ui/EmptyState";

interface Props {
  scenarios: SavedScenario[];
  isLoading: boolean;
  onLoad: (inputs: ScenarioInputs) => void;
}

export function SavedScenariosView({ scenarios, isLoading, onLoad }: Props) {
  const deleteMutation = useDeleteScenario();

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete scenario "${name}"?`)) return;
    deleteMutation.mutate(id);
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="h-4 w-48 bg-gray-200 rounded mb-2" />
            <div className="h-3 w-64 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (scenarios.length === 0) {
    return (
      <EmptyState
        icon={Calculator}
        title="No saved scenarios yet"
        description="Use the Modeller tab to create and save a scenario for comparison."
      />
    );
  }

  return (
    <div className="space-y-3">
      {scenarios.map((s) => {
        const outputs = s.outputs as ScenarioOutputs;
        const inputs = s.inputs as ScenarioInputs;
        return (
          <div
            key={s.id}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{s.name}</h3>
                {s.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{s.description}</p>
                )}
                <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  {new Date(s.createdAt).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    onLoad(inputs);
                    toast({ description: `Loaded "${s.name}"` });
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand text-white hover:bg-brand-hover transition-colors"
                >
                  Load <ArrowRight className="w-3 h-3" />
                </button>
                <button
                  onClick={() => handleDelete(s.id, s.name)}
                  disabled={deleteMutation.isPending}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Key metrics preview */}
            <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-100">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Centres</p>
                <p className="text-xs font-semibold text-gray-800">{inputs.numCentres}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Revenue</p>
                <p className="text-xs font-semibold text-gray-800">{formatAUD(outputs.totalNetworkRevenue)}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Profit</p>
                <p className={`text-xs font-semibold ${outputs.totalNetworkProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {formatAUD(outputs.totalNetworkProfit)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Margin</p>
                <p className="text-xs font-semibold text-gray-800">{outputs.marginPercent.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
