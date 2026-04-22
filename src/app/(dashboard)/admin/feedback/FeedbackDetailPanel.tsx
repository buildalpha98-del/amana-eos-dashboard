"use client";

export function FeedbackDetailPanel({ feedbackId, onClose }: { feedbackId: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside className="w-full max-w-md bg-card border-l border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <p className="text-sm text-muted">Feedback detail — id: {feedbackId}</p>
          <button onClick={onClose} className="mt-4 text-sm text-brand">Close</button>
        </div>
      </aside>
    </div>
  );
}
