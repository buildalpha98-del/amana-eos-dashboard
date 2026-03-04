"use client";

import { useState } from "react";
import type { TeamMember } from "@/hooks/useTeam";
import { PersonCard } from "./PersonCard";
import { Pencil, Check, X } from "lucide-react";

interface OrgChartViewProps {
  members: TeamMember[];
}

export function OrgChartView({ members }: OrgChartViewProps) {
  const visionaries = members.filter((m) => m.role === "owner");
  const integrators = members.filter((m) => m.role === "admin");
  const teamMembers = members.filter((m) => m.role === "member");

  const [tierLabels, setTierLabels] = useState({
    visionary: "Visionary",
    integrator: "Integrator / Department Heads",
    team: "Team Members",
  });
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const startEditTier = (tier: string) => {
    setEditDraft(tierLabels[tier as keyof typeof tierLabels]);
    setEditingTier(tier);
  };
  const saveTier = () => {
    if (editingTier && editDraft.trim()) {
      setTierLabels(prev => ({ ...prev, [editingTier]: editDraft.trim() }));
    }
    setEditingTier(null);
  };

  return (
    <div className="space-y-0">
      {/* Visionary tier */}
      {visionaries.length > 0 && (
        <div className="flex flex-col items-center">
          {editingTier === "visionary" ? (
            <div className="flex items-center gap-1.5 mb-3">
              <input
                type="text"
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveTier(); if (e.key === "Escape") setEditingTier(null); }}
                autoFocus
                className="text-xs font-medium uppercase tracking-wider text-gray-700 bg-white border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-[#004E64]"
              />
              <button onClick={saveTier} className="p-0.5 text-emerald-600 hover:text-emerald-700"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setEditingTier(null)} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mb-3 group/label">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                {tierLabels.visionary}
              </p>
              <button onClick={() => startEditTier("visionary")} className="p-0.5 text-gray-300 hover:text-[#004E64] opacity-0 group-hover/label:opacity-100 transition-opacity">
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-4">
            {visionaries.map((m) => (
              <div key={m.id} className="w-72">
                <PersonCard member={m} compact />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connector line */}
      {visionaries.length > 0 && integrators.length > 0 && (
        <div className="flex justify-center">
          <div className="w-px h-8 bg-gray-300" />
        </div>
      )}

      {/* Integrator / Department Heads tier */}
      {integrators.length > 0 && (
        <div className="flex flex-col items-center">
          {editingTier === "integrator" ? (
            <div className="flex items-center gap-1.5 mb-3">
              <input
                type="text"
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveTier(); if (e.key === "Escape") setEditingTier(null); }}
                autoFocus
                className="text-xs font-medium uppercase tracking-wider text-gray-700 bg-white border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-[#004E64]"
              />
              <button onClick={saveTier} className="p-0.5 text-emerald-600 hover:text-emerald-700"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setEditingTier(null)} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mb-3 group/label">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                {tierLabels.integrator}
              </p>
              <button onClick={() => startEditTier("integrator")} className="p-0.5 text-gray-300 hover:text-[#004E64] opacity-0 group-hover/label:opacity-100 transition-opacity">
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-4">
            {integrators.map((m) => (
              <div key={m.id} className="w-72">
                <PersonCard member={m} compact />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connector line */}
      {integrators.length > 0 && teamMembers.length > 0 && (
        <div className="flex justify-center">
          <div className="w-px h-8 bg-gray-300" />
        </div>
      )}

      {/* Team Members tier */}
      {teamMembers.length > 0 && (
        <div className="flex flex-col items-center">
          {editingTier === "team" ? (
            <div className="flex items-center gap-1.5 mb-3">
              <input
                type="text"
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveTier(); if (e.key === "Escape") setEditingTier(null); }}
                autoFocus
                className="text-xs font-medium uppercase tracking-wider text-gray-700 bg-white border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-[#004E64]"
              />
              <button onClick={saveTier} className="p-0.5 text-emerald-600 hover:text-emerald-700"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setEditingTier(null)} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 mb-3 group/label">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                {tierLabels.team}
              </p>
              <button onClick={() => startEditTier("team")} className="p-0.5 text-gray-300 hover:text-[#004E64] opacity-0 group-hover/label:opacity-100 transition-opacity">
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-4xl">
            {teamMembers.map((m) => (
              <PersonCard key={m.id} member={m} compact />
            ))}
          </div>
        </div>
      )}

      {/* Edge case: no one in any tier */}
      {visionaries.length === 0 &&
        integrators.length === 0 &&
        teamMembers.length === 0 && (
          <p className="text-center text-gray-400 py-12">
            No team members to display.
          </p>
        )}
    </div>
  );
}
