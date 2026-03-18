"use client";

import { useState } from "react";
import { SequenceTemplateList } from "./SequenceTemplateList";
import { ActiveSequencesView } from "./ActiveSequencesView";
import { SequenceBuilder } from "./SequenceBuilder";
import type { SequenceData } from "@/hooks/useSequences";

const SUB_TABS = [
  { key: "templates", label: "Templates" },
  { key: "active", label: "Active" },
] as const;

type SubTab = (typeof SUB_TABS)[number]["key"];

export function SequencesTab() {
  const [subTab, setSubTab] = useState<SubTab>("templates");
  const [selectedSequence, setSelectedSequence] = useState<SequenceData | null>(
    null,
  );

  return (
    <div className="space-y-4">
      {/* Sub-pill navigation */}
      <div className="flex items-center gap-2">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              subTab === tab.key
                ? "bg-brand text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {subTab === "templates" && (
        <SequenceTemplateList onSelect={setSelectedSequence} />
      )}
      {subTab === "active" && <ActiveSequencesView />}

      {/* Builder slide-over */}
      {selectedSequence && (
        <SequenceBuilder
          sequence={selectedSequence}
          onClose={() => setSelectedSequence(null)}
        />
      )}
    </div>
  );
}
