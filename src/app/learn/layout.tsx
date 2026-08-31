import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";

/**
 * Minimal full-screen chrome for the immersive course player. Lives OUTSIDE
 * the (dashboard) group so there is no sidebar — the learner focuses on the
 * course. Opened in a new tab from /my-training.
 */
export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-brand">
            <GraduationCap className="h-5 w-5" />
            Amana Training
          </div>
          <Link
            href="/my-training"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            My Training
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
