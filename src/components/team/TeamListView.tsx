"use client";

import { cn } from "@/lib/utils";
import type { TeamMember } from "@/hooks/useTeam";
import { ROLE_DISPLAY_NAMES } from "@/lib/role-permissions";

const roleBadge: Record<string, { label: string; className: string }> = {
  owner: {
    label: ROLE_DISPLAY_NAMES.owner,
    className: "bg-amber-100 text-amber-800",
  },
  admin: {
    label: ROLE_DISPLAY_NAMES.admin,
    className: "bg-teal-100 text-teal-800",
  },
  member: {
    label: ROLE_DISPLAY_NAMES.member,
    className: "bg-gray-100 text-gray-700",
  },
  staff: {
    label: ROLE_DISPLAY_NAMES.staff,
    className: "bg-blue-100 text-blue-800",
  },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface TeamListViewProps {
  members: TeamMember[];
}

export function TeamListView({ members }: TeamListViewProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-500">Name</th>
              <th className="px-4 py-3 font-medium text-gray-500">Role</th>
              <th className="px-4 py-3 font-medium text-gray-500 text-center">
                Active Rocks
              </th>
              <th className="px-4 py-3 font-medium text-gray-500">
                Todo Completion
              </th>
              <th className="px-4 py-3 font-medium text-gray-500 text-center">
                Open Issues
              </th>
              <th className="px-4 py-3 font-medium text-gray-500 text-center">
                Centres Managed
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map((member) => {
              const badge = roleBadge[member.role] || roleBadge.member;
              return (
                <tr
                  key={member.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {/* Name + avatar + email */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#004E64]/10 flex items-center justify-center">
                        {member.avatar ? (
                          <img
                            src={member.avatar}
                            alt={member.name}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <span className="text-xs font-semibold text-[#004E64]">
                            {getInitials(member.name)}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {member.name}
                        </p>
                        <p className="text-xs text-gray-500">{member.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Role badge */}
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        badge.className
                      )}
                    >
                      {badge.label}
                    </span>
                  </td>

                  {/* Active Rocks */}
                  <td className="px-4 py-3 text-center font-medium text-gray-700">
                    {member.activeRocks}
                  </td>

                  {/* Todo Completion */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#004E64] rounded-full transition-all"
                          style={{
                            width: `${member.todoCompletionPct}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 w-8">
                        {member.todoCompletionPct}%
                      </span>
                    </div>
                  </td>

                  {/* Open Issues */}
                  <td className="px-4 py-3 text-center">
                    {member.openIssues > 0 ? (
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        {member.openIssues}
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-green-600">
                        Clear
                      </span>
                    )}
                  </td>

                  {/* Centres Managed */}
                  <td className="px-4 py-3 text-center font-medium text-gray-700">
                    {member.managedServices}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
