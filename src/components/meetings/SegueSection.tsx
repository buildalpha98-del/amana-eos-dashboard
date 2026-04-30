"use client";

export function SegueSection({
  notes,
  onUpdate,
}: {
  notes: string;
  onUpdate: (val: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-purple-800 mb-1">
          Good News
        </h4>
        <p className="text-xs text-purple-600">
          Share one personal and one professional piece of good news to start the
          meeting on a positive note.
        </p>
      </div>
      <textarea
        value={notes}
        onChange={(e) => onUpdate(e.target.value)}
        placeholder="Capture good news shared by team members..."
        className="w-full h-40 p-3 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
      />
    </div>
  );
}
