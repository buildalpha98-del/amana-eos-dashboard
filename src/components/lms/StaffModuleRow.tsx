"use client";

import {
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  HelpCircle,
  ListChecks,
  Play,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LMSModuleData } from "@/hooks/useLMS";

const MODULE_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  document: FileText,
  video: Video,
  quiz: HelpCircle,
  checklist: ListChecks,
  external_link: ExternalLink,
};

interface Props {
  mod: LMSModuleData;
  isComplete: boolean;
  isExpanded: boolean;
  onToggleComplete: () => void;
  onToggleExpand: () => void;
}

/**
 * One module row inside the staff "My Courses" list on /onboarding.
 * Extracted from the inline StaffLMSView so we can unit-test the open/close
 * behaviour — especially for module types without text content (video,
 * external_link) which previously failed to render anything when expanded
 * (bug #6 — "training module not opening").
 */
export function StaffModuleRow({
  mod,
  isComplete,
  isExpanded,
  onToggleComplete,
  onToggleExpand,
}: Props) {
  const ModIcon = MODULE_TYPE_ICONS[mod.type] || FileText;
  // Quiz modules complete only by PASSING the quiz in the course player —
  // the manual toggle would 403 server-side, so don't offer it.
  const isQuiz = mod.type === "quiz";

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
        {isQuiz ? (
          <span
            className="flex-shrink-0"
            title="Completed by passing the quiz in the course player"
          >
            {isComplete ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            ) : (
              <Circle className="w-5 h-5 text-muted/30" />
            )}
          </span>
        ) : (
          <button
            type="button"
            aria-label={isComplete ? "Mark incomplete" : "Mark complete"}
            onClick={onToggleComplete}
            className="flex-shrink-0"
          >
            {isComplete ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            ) : (
              <Circle className="w-5 h-5 text-muted/50 hover:text-brand" />
            )}
          </button>
        )}
        <ModIcon className="w-4 h-4 text-muted flex-shrink-0" />
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex-1 text-left"
        >
          <p
            className={cn(
              "text-sm font-medium",
              isComplete ? "text-muted line-through" : "text-foreground",
            )}
          >
            {mod.title}
          </p>
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          className="text-xs text-brand hover:underline flex-shrink-0"
        >
          {isExpanded ? "Hide" : "View"}
        </button>
      </div>
      {isExpanded && (
        <div className="px-12 pb-3 space-y-2" data-testid="module-expanded-content">
          {mod.description && (
            <p className="text-xs text-muted italic">{mod.description}</p>
          )}
          {mod.content && (
            <div className="prose prose-sm max-w-none text-muted whitespace-pre-wrap text-xs leading-relaxed">
              {mod.content}
            </div>
          )}
          {(mod.type === "video" || mod.type === "external_link") && mod.resourceUrl && (
            <a
              href={mod.resourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand rounded-md hover:bg-brand-hover transition-colors"
            >
              {mod.type === "video" ? (
                <Play className="w-3 h-3" />
              ) : (
                <ExternalLink className="w-3 h-3" />
              )}
              {mod.type === "video" ? "Watch Video" : "Open Resource"}
            </a>
          )}
          {mod.type !== "video" && mod.type !== "external_link" && mod.resourceUrl && (
            <a
              href={mod.resourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> Open resource
            </a>
          )}
          {isQuiz && (
            <p className="text-xs text-muted italic">
              This quiz is taken in the course player — open the course from My
              Training to complete it.
            </p>
          )}
          {!mod.content && !mod.resourceUrl && !isQuiz && (
            <p className="text-xs text-muted italic">
              No content available for this module yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
