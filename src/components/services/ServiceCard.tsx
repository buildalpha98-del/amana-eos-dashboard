"use client";

import { cn } from "@/lib/utils";
import {
  MapPin,
  Users,
  CheckSquare,
  AlertCircle,
  FolderKanban,
  ChevronRight,
} from "lucide-react";
import type { ServiceSummary } from "@/hooks/useServices";

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-emerald-100 text-emerald-700" },
  onboarding: { label: "Onboarding", color: "bg-blue-100 text-blue-700" },
  pipeline: { label: "Pipeline", color: "bg-purple-100 text-purple-700" },
  closing: { label: "Closing", color: "bg-amber-100 text-amber-700" },
  closed: { label: "Closed", color: "bg-gray-100 text-gray-500" },
};

export function ServiceCard({
  service,
  onClick,
}: {
  service: ServiceSummary;
  onClick: () => void;
}) {
  const status = statusConfig[service.status] || statusConfig.active;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card rounded-xl border border-border p-3.5 sm:p-5 hover:shadow-md hover:border-border transition-all group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-semibold text-muted font-mono tracking-wide uppercase">
              {service.code}
            </p>
            <span
              className={cn(
                "inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap",
                status.color
              )}
            >
              {status.label}
            </span>
          </div>
          <h3 className="text-base font-semibold text-foreground line-clamp-2 leading-snug">
            {service.name}
          </h3>

          {(service.suburb || service.state) && (
            <div className="flex items-center gap-1 mt-2 text-sm text-muted">
              <MapPin className="w-3.5 h-3.5" />
              <span>
                {[service.suburb, service.state].filter(Boolean).join(", ")}
              </span>
            </div>
          )}

          {service.manager && (
            <div className="flex items-center gap-1 mt-1.5 text-sm text-muted">
              <Users className="w-3.5 h-3.5" />
              <span>{service.manager?.name ?? "Unassigned"}</span>
            </div>
          )}
        </div>

        <ChevronRight className="w-5 h-5 text-border group-hover:text-brand transition-colors flex-shrink-0 mt-1" />
      </div>

      {/* Counts bar */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-3 sm:mt-4 pt-3 border-t border-border/50">
        <div className="flex items-center gap-1 text-xs text-muted">
          <CheckSquare className="w-3.5 h-3.5" />
          <span>
            <span className="font-semibold text-foreground/80">
              {service._count.todos}
            </span>{" "}
            to-dos
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>
            <span className="font-semibold text-foreground/80">
              {service._count.issues}
            </span>{" "}
            issues
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted">
          <FolderKanban className="w-3.5 h-3.5" />
          <span>
            <span className="font-semibold text-foreground/80">
              {service._count.projects}
            </span>{" "}
            projects
          </span>
        </div>
        {service.capacity && (
          <div className="ml-auto text-xs text-muted">
            Cap: {service.capacity}
          </div>
        )}
      </div>
    </button>
  );
}
