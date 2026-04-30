"use client";

export function HeadlinesSection({
  headlines,
  onUpdate,
}: {
  headlines: string;
  onUpdate: (val: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-amber-800 mb-1">
          Customer &amp; Employee Headlines
        </h4>
        <p className="text-xs text-amber-600">
          Quick one-line updates. Good or bad news about customers or employees.
          Drop anything needing discussion into IDS.
        </p>
      </div>
      <textarea
        value={headlines}
        onChange={(e) => onUpdate(e.target.value)}
        placeholder="Capture headlines here...&#10;&#10;Example:&#10;- Customer: New enrolment at Greenfield centre (+12 places)&#10;- Employee: Sarah passed her cert III &#10;- Customer: Complaint from parent at Eastside re pickup times (IDS)"
        className="w-full h-48 p-3 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
      />
    </div>
  );
}
