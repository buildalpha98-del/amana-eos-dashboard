"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

const REASONS = [
  { value: "moved_schools", label: "Moved to a different school" },
  { value: "no_longer_need_care", label: "No longer need care" },
  { value: "cost", label: "Cost / affordability" },
  { value: "unhappy_with_service", label: "Unhappy with the service" },
  { value: "child_did_not_enjoy", label: "Child did not enjoy" },
  { value: "schedule_change", label: "Schedule change" },
  { value: "other", label: "Other" },
];

const SATISFACTION_FACES = [
  { score: 1, emoji: "😢", label: "Very Unhappy" },
  { score: 2, emoji: "😟", label: "Unhappy" },
  { score: 3, emoji: "😐", label: "Neutral" },
  { score: 4, emoji: "😊", label: "Happy" },
  { score: 5, emoji: "😍", label: "Very Happy" },
];

const SELECTED_BG: Record<number, string> = {
  1: "bg-red-100 ring-2 ring-red-400",
  2: "bg-orange-100 ring-2 ring-orange-400",
  3: "bg-yellow-100 ring-2 ring-yellow-400",
  4: "bg-green-100 ring-2 ring-green-400",
  5: "bg-emerald-100 ring-2 ring-emerald-400",
};

export default function ExitSurveyPage() {
  const params = useParams();
  const token = params.token as string;

  const [survey, setSurvey] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [reason, setReason] = useState("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [enjoyedMost, setEnjoyedMost] = useState("");
  const [couldImprove, setCouldImprove] = useState("");
  const [wouldReturn, setWouldReturn] = useState("");

  useEffect(() => {
    fetch(`/api/exit-survey/${token}`)
      .then(async (r) => {
        if (r.status === 410) {
          setExpired(true);
          return;
        }
        if (!r.ok) {
          setExpired(true);
          return;
        }
        const data = await r.json();
        if (data.completedAt) {
          setCompleted(true);
        }
        setSurvey(data);
      })
      .catch(() => setExpired(true))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async () => {
    if (!reason || satisfaction === null || !wouldReturn) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/exit-survey/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          reasonDetail: reasonDetail.trim() || null,
          satisfactionScore: satisfaction,
          enjoyedMost: enjoyedMost.trim() || null,
          couldImprove: couldImprove.trim() || null,
          wouldReturn,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong.");
        setSubmitting(false);
        return;
      }

      setCompleted(true);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#004E64] via-[#005f77] to-[#00768a]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
      </div>
    );
  }

  if (expired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#004E64] via-[#005f77] to-[#00768a]">
        <div className="max-w-md w-full mx-4 bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="text-5xl mb-4">⏰</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Survey Expired
          </h1>
          <p className="text-gray-600 text-sm">
            This exit survey link has expired or is no longer valid. Please
            contact your centre if you&apos;d like to provide feedback.
          </p>
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#004E64] via-[#005f77] to-[#00768a]">
        <div className="max-w-md w-full mx-4 bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="text-5xl mb-4">🙏</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Thank You for Your Feedback
          </h1>
          <p className="text-gray-600 text-sm">
            We appreciate you taking the time to share your experience. Your
            feedback helps us improve our service for all families.
          </p>
          <div className="mt-6 pt-4 border-t">
            <p className="text-xs text-gray-400">Amana OSHC</p>
          </div>
        </div>
      </div>
    );
  }

  const isValid = reason && satisfaction !== null && wouldReturn;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#004E64] via-[#005f77] to-[#00768a] px-4 py-8">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#004E64] px-6 py-5 text-center">
          <h1 className="text-xl font-bold text-white">Amana OSHC</h1>
          <p className="text-white/70 text-sm mt-1">Exit Feedback Survey</p>
        </div>

        <div className="p-6 space-y-6">
          <div className="text-center">
            <p className="text-sm text-gray-600">
              We&apos;re sorry to see{" "}
              <strong>{survey?.childName}</strong> go. Your feedback is
              invaluable in helping us improve.
            </p>
          </div>

          {/* Q1: Reason */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              1. What is the main reason for leaving? *
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#004E64] focus:border-[#004E64]"
            >
              <option value="">Select a reason...</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            {reason && (
              <textarea
                rows={2}
                value={reasonDetail}
                onChange={(e) => setReasonDetail(e.target.value)}
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#004E64] focus:border-[#004E64]"
                placeholder="Any additional details? (optional)"
              />
            )}
          </div>

          {/* Q2: Satisfaction */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              2. Overall, how satisfied were you with our service? *
            </label>
            <div className="flex justify-center gap-3">
              {SATISFACTION_FACES.map((s) => (
                <button
                  key={s.score}
                  onClick={() => setSatisfaction(s.score)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl transition-all ${
                    satisfaction === s.score
                      ? SELECTED_BG[s.score]
                      : "bg-gray-50 hover:bg-gray-100"
                  }`}
                >
                  <span className="text-3xl">{s.emoji}</span>
                  <span className="text-[9px] text-gray-500">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Q3: Enjoyed most */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              3. What did your child enjoy most?
            </label>
            <textarea
              rows={2}
              value={enjoyedMost}
              onChange={(e) => setEnjoyedMost(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#004E64] focus:border-[#004E64]"
              placeholder="Activities, friendships, educators..."
            />
          </div>

          {/* Q4: Could improve */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              4. What could we have done better?
            </label>
            <textarea
              rows={2}
              value={couldImprove}
              onChange={(e) => setCouldImprove(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-[#004E64] focus:border-[#004E64]"
              placeholder="Communication, programs, facilities..."
            />
          </div>

          {/* Q5: Would return */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">
              5. Would you consider returning to Amana OSHC? *
            </label>
            <div className="flex gap-3">
              {["yes", "maybe", "no"].map((opt) => (
                <button
                  key={opt}
                  onClick={() => setWouldReturn(opt)}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all border ${
                    wouldReturn === opt
                      ? "bg-[#004E64] text-white border-[#004E64]"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="w-full py-3 px-4 bg-[#004E64] hover:bg-[#003d4f] text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : "Submit Feedback"}
          </button>

          <p className="text-center text-xs text-gray-400">
            Your feedback is confidential and helps us improve.
          </p>
        </div>
      </div>
    </div>
  );
}
