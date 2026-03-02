"use client";

import { cn, getCurrentQuarter } from "@/lib/utils";

function getQuarterOptions() {
  const now = new Date();
  const year = now.getFullYear();
  const quarters: string[] = [];

  // Previous year Q4, current year all quarters, next year Q1
  quarters.push(`Q4-${year - 1}`);
  for (let q = 1; q <= 4; q++) {
    quarters.push(`Q${q}-${year}`);
  }
  quarters.push(`Q1-${year + 1}`);

  return quarters;
}

export function QuarterSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (quarter: string) => void;
}) {
  const options = getQuarterOptions();
  const current = getCurrentQuarter();

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
      {options.map((q) => (
        <button
          key={q}
          onClick={() => onChange(q)}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150",
            value === q
              ? "bg-[#1B4D3E] text-white shadow-sm"
              : q === current
              ? "text-[#1B4D3E] hover:bg-white/60 font-semibold"
              : "text-gray-500 hover:bg-white/60"
          )}
        >
          {q.replace("-", " ")}
        </button>
      ))}
    </div>
  );
}
