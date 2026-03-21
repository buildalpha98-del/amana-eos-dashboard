"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Printer, Link2, Check } from "lucide-react";
import type { GuideContent, GuideSection } from "@/lib/staff-guides";

// ---------------------------------------------------------------------------
// Collapsible section (mobile accordion)
// ---------------------------------------------------------------------------

function SectionCard({ section, index }: { section: GuideSection; index: number }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="bg-card rounded-xl border border-border p-6 print:border-gray-200 print:shadow-none print:break-inside-avoid">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left sm:pointer-events-none"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <span className="text-xl print:text-base" aria-hidden>
            {section.icon}
          </span>
          {section.title}
        </h3>
        <span className="sm:hidden text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {/* Always visible on desktop / print, collapsible on mobile */}
      <div className={`mt-4 ${open ? "block" : "hidden sm:block"}`}>
        <ol className="space-y-2 list-decimal list-inside">
          {section.steps.map((step, i) => (
            <li key={i} className="text-muted-foreground leading-relaxed">
              {step.bold ? (
                <>
                  <kbd className="inline-block rounded border border-border bg-surface px-1.5 py-0.5 text-xs font-mono font-medium text-foreground print:border-gray-300 print:bg-gray-100">
                    {step.bold}
                  </kbd>{" "}
                  {step.text}
                </>
              ) : (
                step.text
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main guide renderer
// ---------------------------------------------------------------------------

interface QuickStartGuideProps {
  guide: GuideContent;
}

export function QuickStartGuide({ guide }: QuickStartGuideProps) {
  const today = new Date().toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="max-w-3xl mx-auto print:max-w-none">
      {/* Header */}
      <div className="mb-8 print:mb-6 print:border-b print:border-gray-300 print:pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-brand/10 flex items-center justify-center text-brand font-bold text-lg print:bg-gray-100 print:text-black">
            A
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Amana OSHC
            </p>
            <h1 className="text-2xl font-bold text-foreground print:text-black">
              {guide.displayName} Quick-Start Guide
            </h1>
          </div>
        </div>
        <p className="text-base text-muted-foreground mt-3 leading-relaxed print:text-gray-600">
          {guide.welcome}
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-4 print:space-y-6">
        {guide.sections.map((section, i) => (
          <SectionCard key={i} section={section} index={i} />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-border text-center text-xs text-muted-foreground print:border-gray-300 print:text-gray-500">
        Generated from Amana OSHC Dashboard &bull; {today}
      </div>
    </div>
  );
}
