"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Lock,
  Circle,
  PartyPopper,
  Clock,
} from "lucide-react";
import { ModuleContent, type PlayerModule } from "./ModuleContent";
import { QuizPlayer } from "./QuizPlayer";
import { useCompleteModule } from "@/hooks/useQuiz";
import {
  canAdvanceModule,
  requiredSecondsOnPage,
  firstIncompleteIndex,
} from "@/lib/course-player";

export interface CoursePlayerProps {
  enrollmentId: string;
  courseTitle: string;
  modules: PlayerModule[];
  initialCompletedIds: string[];
}

export function CoursePlayer({
  enrollmentId,
  courseTitle,
  modules,
  initialCompletedIds,
}: CoursePlayerProps) {
  const completeModule = useCompleteModule();
  const [completed, setCompleted] = useState<Set<string>>(
    () => new Set(initialCompletedIds),
  );
  const [quizPassed, setQuizPassed] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(() =>
    firstIncompleteIndex(modules, new Set(initialCompletedIds)),
  );
  const [seconds, setSeconds] = useState(0);
  const [showCompletion, setShowCompletion] = useState(false);
  const markedRef = useRef<Set<string>>(new Set());

  const current = modules[index];

  // Dwell timer — reset whenever the module changes.
  useEffect(() => {
    setSeconds(0);
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [index]);

  // Auto-mark non-quiz modules complete once the dwell floor is met, so
  // progress persists even if the learner closes the tab.
  useEffect(() => {
    if (!current || current.type === "quiz") return;
    if (completed.has(current.id) || markedRef.current.has(current.id)) return;
    if (seconds >= requiredSecondsOnPage(current)) {
      markedRef.current.add(current.id);
      completeModule.mutate(
        { enrollmentId, moduleId: current.id, timeSpent: seconds },
        {
          onSuccess: () =>
            setCompleted((prev) => new Set(prev).add(current.id)),
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, current, completed]);

  const allComplete = useMemo(
    () => modules.every((m) => completed.has(m.id)),
    [modules, completed],
  );

  if (!current) return null;

  const canAdvance = canAdvanceModule(current, {
    timeOnPageSec: seconds,
    quizPassed: quizPassed.has(current.id),
    alreadyComplete: completed.has(current.id),
  });
  const isLast = index === modules.length - 1;
  const progressPct = Math.round((completed.size / modules.length) * 100);
  const remainingDwell = Math.max(0, requiredSecondsOnPage(current) - seconds);

  function goNext() {
    if (isLast) {
      setShowCompletion(true);
      return;
    }
    setIndex((i) => Math.min(i + 1, modules.length - 1));
  }

  if (showCompletion || (allComplete && showCompletion)) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <PartyPopper className="mx-auto h-14 w-14 text-brand" />
        <h1 className="mt-4 text-2xl font-bold text-foreground">Course complete!</h1>
        <p className="mt-2 text-muted">
          You&apos;ve finished <span className="font-semibold">{courseTitle}</span>. Your progress has been saved.
        </p>
        <Link
          href="/my-training"
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
        >
          Back to My Training
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[280px_1fr]">
      {/* Module list */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Progress</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <ol className="space-y-1">
          {modules.map((m, i) => {
            const done = completed.has(m.id);
            const active = i === index;
            const reachable = i <= index || done;
            return (
              <li key={m.id}>
                <button
                  disabled={!reachable}
                  onClick={() => reachable && setIndex(i)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    active ? "bg-brand/10 text-brand" : "text-foreground hover:bg-surface"
                  } ${!reachable ? "cursor-not-allowed opacity-50" : ""}`}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                  ) : reachable ? (
                    <Circle className="h-4 w-4 shrink-0 text-muted" />
                  ) : (
                    <Lock className="h-4 w-4 shrink-0 text-muted" />
                  )}
                  <span className="truncate">{m.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      {/* Content pane */}
      <main className="min-w-0">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
          Section {index + 1} of {modules.length}
        </div>
        <h1 className="mb-6 text-xl font-bold text-foreground">{current.title}</h1>

        {current.type === "quiz" ? (
          <>
            <ModuleContent module={current} />
            <div className="mt-6">
              <QuizPlayer
                moduleId={current.id}
                alreadyPassed={completed.has(current.id)}
                onPassed={() => {
                  setQuizPassed((prev) => new Set(prev).add(current.id));
                  setCompleted((prev) => new Set(prev).add(current.id));
                }}
              />
            </div>
          </>
        ) : (
          <ModuleContent module={current} />
        )}

        {/* Nav */}
        <div className="mt-10 flex items-center justify-between border-t border-border pt-4">
          <button
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-surface disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>

          <div className="flex items-center gap-3">
            {!canAdvance && current.type !== "quiz" && remainingDwell > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <Clock className="h-3.5 w-3.5" />
                Keep reading… {remainingDwell}s
              </span>
            )}
            {!canAdvance && current.type === "quiz" && (
              <span className="text-xs text-muted">Pass the quiz to continue</span>
            )}
            <button
              onClick={goNext}
              disabled={!canAdvance}
              className="inline-flex items-center gap-1 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLast ? "Finish course" : "Next"}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
