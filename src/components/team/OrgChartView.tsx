"use client";

import type { TeamMember } from "@/hooks/useTeam";
import { PersonCard } from "./PersonCard";

interface OrgChartViewProps {
  members: TeamMember[];
}

export function OrgChartView({ members }: OrgChartViewProps) {
  const visionaries = members.filter((m) => m.role === "owner");
  const integrators = members.filter((m) => m.role === "admin");
  const teamMembers = members.filter((m) => m.role === "member");

  return (
    <div className="space-y-0">
      {/* Visionary tier */}
      {visionaries.length > 0 && (
        <div className="flex flex-col items-center">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">
            Visionary
          </p>
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
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">
            Integrator / Department Heads
          </p>
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
          <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">
            Team Members
          </p>
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
