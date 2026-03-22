"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

const SMILEYS = [
  { score: 1, emoji: "😢", label: "Very Unhappy", color: "hover:bg-red-50 focus:ring-red-300" },
  { score: 2, emoji: "😟", label: "Unhappy", color: "hover:bg-orange-50 focus:ring-orange-300" },
  { score: 3, emoji: "😐", label: "Neutral", color: "hover:bg-yellow-50 focus:ring-yellow-300" },
  { score: 4, emoji: "😊", label: "Happy", color: "hover:bg-green-50 focus:ring-green-300" },
  { score: 5, emoji: "😍", label: "Very Happy", color: "hover:bg-emerald-50 focus:ring-emerald-300" },
];

const SELECTED_BG: Record<number, string> = {
  1: "bg-red-100 ring-2 ring-red-400",
  2: "bg-orange-100 ring-2 ring-orange-400",
  3: "bg-yellow-100 ring-2 ring-yellow-400",
  4: "bg-green-100 ring-2 ring-green-400",
  5: "bg-emerald-100 ring-2 ring-emerald-400",
};

export default function QuickFeedbackPage() {
  const params = useParams();
  const serviceId = params.serviceId as string;

  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [parentName, setParentName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [serviceName, setServiceName] = useState("");

  useEffect(() => {
    // Use the public service-name lookup (no auth required)
    fetch(`/api/services/${serviceId}/public-name`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.name) setServiceName(data.name);
      })
      .catch(() => {});
  }, [serviceId]);

  const handleSubmit = async () => {
    if (score === null) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/feedback/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          score,
          comment: comment.trim() || null,
          parentName: parentName.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#004E64] via-[#005f77] to-[#00768a]">
        <div className="max-w-md w-full mx-4 bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Thank You!</h1>
          <p className="text-muted">
            Your feedback helps us create the best experience for your child
            {serviceName ? ` at ${serviceName}` : ""}.
          </p>
          <div className="mt-6 pt-4 border-t">
            <p className="text-xs text-muted">Amana OSHC</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#004E64] via-[#005f77] to-[#00768a] px-4 py-8">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#004E64] px-6 py-5 text-center">
          <h1 className="text-xl font-bold text-white tracking-tight">
            Amana OSHC
          </h1>
          {serviceName && (
            <p className="text-white/70 text-sm mt-1">{serviceName}</p>
          )}
        </div>

        <div className="p-6 space-y-6">
          {/* Question */}
          <div className="text-center">
            <h2 className="text-lg font-semibold text-foreground">
              How was your child&apos;s experience this week?
            </h2>
            <p className="text-sm text-muted mt-1">
              Tap a face to share your feedback
            </p>
          </div>

          {/* Smiley faces */}
          <div className="flex justify-center gap-3">
            {SMILEYS.map((s) => (
              <button
                key={s.score}
                onClick={() => setScore(s.score)}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all duration-200 ${
                  score === s.score
                    ? SELECTED_BG[s.score]
                    : `bg-surface/50 ${s.color}`
                }`}
                title={s.label}
              >
                <span className="text-4xl">{s.emoji}</span>
                <span className="text-[10px] text-muted font-medium">
                  {s.label}
                </span>
              </button>
            ))}
          </div>

          {/* Comment */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Any comments? <span className="text-muted">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-[#004E64] focus:border-[#004E64]"
              placeholder="Tell us more..."
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              Your name <span className="text-muted">(optional)</span>
            </label>
            <input
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:ring-[#004E64] focus:border-[#004E64]"
              placeholder="Parent name"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={score === null || submitting}
            className="w-full py-3 px-4 bg-[#004E64] hover:bg-[#003d4f] text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : "Submit Feedback"}
          </button>

          <p className="text-center text-xs text-muted">
            Your response is anonymous unless you provide your name.
          </p>
        </div>
      </div>
    </div>
  );
}
