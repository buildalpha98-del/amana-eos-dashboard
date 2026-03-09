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
      className="w-full text-left bg-white rounded-xl border border-gray-200 p-3.5 sm:p-5 hover:shadow-md hover:border-gray-300 transition-all group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-semibold text-gray-500 font-mono tracking-wide uppercase">
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
          <h3 className="text-base font-semibold text-gray-900 line-clamp-2 leading-snug">
            {service.name}
          </h3>

          {(service.suburb || service.state) && (
            <div className="flex items-center gap-1 mt-2 text-sm text-gray-500">
              <MapPin className="w-3.5 h-3.5" />
              <span>
                {[service.suburb, service.state].filter(Boolean).join(", ")}
              </span>
            </div>
          )}

          {service.manager && (
            <div className="flex items-center gap-1 mt-1.5 text-sm text-gray-500">
              <Users className="w-3.5 h-3.5" />
              <span>{service.manager.name}</span>
            </div>
          )}
        </div>

        <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-brand transition-colors flex-shrink-0 mt-1" />
      </div>

      {/* Counts bar */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-3 sm:mt-4 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <CheckSquare className="w-3.5 h-3.5" />
          <span>
            <span className="font-semibold text-gray-700">
              {service._count.todos}
            </span>{" "}
            to-dos
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>
            <span className="font-semibold text-gray-700">
              {service._count.issues}
            </span>{" "}
            issues
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <FolderKanban className="w-3.5 h-3.5" />
          <span>
            <span className="font-semibold text-gray-700">
              {service._count.projects}
            </span>{" "}
            projects
          </span>
        </div>
        {service.capacity && (
          <div className="ml-auto text-xs text-gray-400">
            Cap: {service.capacity}
          </div>
        )}
      </div>
    </button>
  );
}
