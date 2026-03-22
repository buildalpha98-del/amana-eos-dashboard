"use client";

import { Briefcase, ChevronRight } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  educator: "Educator",
  senior_educator: "Senior Educator",
  coordinator: "Coordinator",
  director: "Director",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  interviewing: "bg-amber-100 text-amber-700",
  offered: "bg-purple-100 text-purple-700",
  filled: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-surface text-muted",
};

interface Vacancy {
  id: string;
  role: string;
  employmentType: string;
  status: string;
  qualificationRequired: string | null;
  createdAt: string;
  targetFillDate: string | null;
  service: { id: string; name: string; code: string };
  assignedTo: { id: string; name: string } | null;
  _count: { candidates: number };
}

interface VacancyTableProps {
  vacancies: Vacancy[];
  isLoading: boolean;
  onSelect: (id: string) => void;
}

export function VacancyTable({ vacancies, isLoading, onSelect }: VacancyTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-border border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (vacancies.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border p-12 text-center">
        <Briefcase className="h-12 w-12 text-muted/50 mx-auto mb-3" />
        <p className="text-muted text-sm">No vacancies found</p>
        <p className="text-muted text-xs mt-1">Create a new vacancy to get started</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-surface/50 border-b border-border">
            <th className="text-left text-xs font-medium text-muted uppercase px-4 py-3">Role</th>
            <th className="text-left text-xs font-medium text-muted uppercase px-4 py-3">Centre</th>
            <th className="text-left text-xs font-medium text-muted uppercase px-4 py-3">Type</th>
            <th className="text-left text-xs font-medium text-muted uppercase px-4 py-3">Status</th>
            <th className="text-left text-xs font-medium text-muted uppercase px-4 py-3">Candidates</th>
            <th className="text-left text-xs font-medium text-muted uppercase px-4 py-3">Assigned To</th>
            <th className="text-left text-xs font-medium text-muted uppercase px-4 py-3">Target Date</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {vacancies.map((v) => (
            <tr
              key={v.id}
              onClick={() => onSelect(v.id)}
              className="hover:bg-surface cursor-pointer transition-colors"
            >
              <td className="px-4 py-3">
                <span className="text-sm font-medium text-foreground">
                  {ROLE_LABELS[v.role] || v.role}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-muted">{v.service.name}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-muted capitalize">
                  {v.employmentType.replace("_", " ")}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[v.status] || "bg-surface text-foreground/80"}`}>
                  {v.status}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-muted">{v._count.candidates}</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-muted">
                  {v.assignedTo?.name || "—"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-muted">
                  {v.targetFillDate
                    ? new Date(v.targetFillDate).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                      })
                    : "—"}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <ChevronRight className="h-4 w-4 text-muted" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
