"use client";

import { useVTO } from "@/hooks/useVTO";
import { CoreValuesCard } from "@/components/vision/CoreValuesCard";
import { VTOSection } from "@/components/vision/VTOSection";
import { GoalsSection } from "@/components/vision/GoalsSection";
import { Eye } from "lucide-react";

export default function VisionPage() {
  const { data: vto, isLoading, error } = useVTO();

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Vision / Traction Organiser
          </h2>
          <p className="text-sm text-gray-500">
            Your strategic compass — click any section to edit
          </p>
        </div>
        {vto?.updatedBy && (
          <p className="text-xs text-gray-400">
            Last updated by {vto.updatedBy.name} on{" "}
            {new Date(vto.updatedAt).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-8 h-8 border-2 border-[#1B4D3E] border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-xl border border-gray-200">
          <div className="w-16 h-16 rounded-2xl bg-[#1B4D3E]/5 flex items-center justify-center mb-4">
            <Eye className="w-8 h-8 text-[#1B4D3E]/30" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            V/TO not available
          </h3>
          <p className="text-gray-500 mt-2 max-w-md">
            No Vision/Traction Organiser has been set up yet. Run the database
            seed to create the default V/TO.
          </p>
        </div>
      ) : vto ? (
        <div className="space-y-6">
          {/* Vision Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="flex items-center gap-2 px-1">
                <div className="w-1.5 h-6 rounded-full bg-[#1B4D3E]" />
                <h3 className="text-sm font-bold text-[#1B4D3E] uppercase tracking-wider">
                  Vision
                </h3>
              </div>

              <CoreValuesCard values={vto.coreValues} />

              <VTOSection
                title="Core Purpose"
                field="corePurpose"
                value={vto.corePurpose}
              />

              <VTOSection
                title="Core Niche"
                field="coreNiche"
                value={vto.coreNiche}
              />

              <VTOSection
                title="10-Year Target (BHAG)"
                field="tenYearTarget"
                value={vto.tenYearTarget}
                multiline
              />
            </div>

            {/* Traction Side */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 px-1">
                <div className="w-1.5 h-6 rounded-full bg-[#FECE00]" />
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
                  Traction
                </h3>
              </div>

              <VTOSection
                title="3-Year Picture"
                field="threeYearPicture"
                value={vto.threeYearPicture}
                multiline
              />

              <GoalsSection goals={vto.oneYearGoals} vtoId={vto.id} />

              <VTOSection
                title="Marketing Strategy"
                field="marketingStrategy"
                value={vto.marketingStrategy}
                multiline
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
