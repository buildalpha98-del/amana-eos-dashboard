"use client";

/**
 * /ramp-checkin/[token] — the unauthenticated weekly ramp check-in a new
 * starter lands on from their Friday email. No login: the token in the URL
 * is the whole access control, same model as a password-reset link.
 */

import { use, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, Smile } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";
import { RAMP_MOOD_LABELS } from "@/lib/ramp/constants";

interface CheckInInfo {
  name: string;
  weekNumber: number;
  alreadySubmitted: boolean;
  closed: boolean;
}

const MOODS = [1, 2, 3, 4, 5].map((value) => ({ value, label: RAMP_MOOD_LABELS[value] }));

const TEXTAREA =
  "w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand";

export default function RampCheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { data, isLoading, error } = useQuery<CheckInInfo>({
    queryKey: ["ramp-checkin", token],
    queryFn: () => fetchApi(`/api/public/ramp-checkin/${token}`),
    retry: 1,
  });

  const [mood, setMood] = useState<number | null>(null);
  const [wentWell, setWentWell] = useState("");
  const [struggling, setStruggling] = useState("");
  const [needsHelp, setNeedsHelp] = useState(false);
  const [helpDetail, setHelpDetail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      mutateApi(`/api/public/ramp-checkin/${token}`, {
        method: "POST",
        body: {
          mood,
          wentWell: wentWell.trim() || undefined,
          struggling: struggling.trim() || undefined,
          needsHelp,
          helpDetail: needsHelp ? helpDetail.trim() || undefined : undefined,
        },
      }),
    onSuccess: () => setSubmitted(true),
    onError: (err: Error) => setSubmitError(err.message || "Something went wrong"),
  });

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-sm p-6">
        {isLoading ? (
          <p className="text-sm text-muted text-center py-8">Loading…</p>
        ) : error || !data ? (
          <p className="text-sm text-muted text-center py-8">This link isn&apos;t valid or has expired.</p>
        ) : submitted || data.alreadySubmitted ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-10 h-10 mx-auto text-brand mb-3" />
            <h1 className="text-lg font-semibold text-foreground">Thanks, {data.name}!</h1>
            <p className="text-sm text-muted mt-1">
              {needsHelp
                ? "Your manager has been told you need a hand and will be in touch."
                : "Your check-in is with your manager and the State Manager team."}
            </p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (mood) submit.mutate();
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Smile className="w-5 h-5 text-brand" />
              <h1 className="text-lg font-semibold text-foreground">
                {data.weekNumber === 1 ? "How was your first week" : `How was week ${data.weekNumber}`}, {data.name}?
              </h1>
            </div>
            <p className="text-sm text-muted mb-4">Takes a minute — it goes straight to your manager.</p>

            <div className="flex justify-between gap-1.5 mb-4">
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMood(m.value)}
                  aria-pressed={mood === m.value}
                  className={`flex-1 py-3 rounded-xl border text-xs font-medium transition-colors ${
                    mood === m.value
                      ? "bg-brand text-white border-brand"
                      : "bg-card text-foreground border-border hover:bg-surface"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <label className="text-xs text-muted block mb-1" htmlFor="wentWell">
              What went well this week? (optional)
            </label>
            <textarea id="wentWell" value={wentWell} onChange={(e) => setWentWell(e.target.value)} rows={2} className={TEXTAREA} />

            <label className="text-xs text-muted block mb-1 mt-3" htmlFor="struggling">
              What&apos;s been hard? (optional)
            </label>
            <textarea id="struggling" value={struggling} onChange={(e) => setStruggling(e.target.value)} rows={2} className={TEXTAREA} />

            <label className="flex items-center gap-2 mt-4 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={needsHelp}
                onChange={(e) => setNeedsHelp(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-brand"
              />
              I need something from the team
            </label>
            {needsHelp && (
              <textarea
                value={helpDetail}
                onChange={(e) => setHelpDetail(e.target.value)}
                rows={2}
                className={`${TEXTAREA} mt-2`}
                placeholder="What would help?"
                aria-label="What would help?"
              />
            )}

            {submitError && <p className="text-xs text-red-600 dark:text-red-400 mt-3">{submitError}</p>}

            <button
              type="submit"
              disabled={!mood || submit.isPending}
              className="w-full mt-4 py-3 rounded-xl bg-accent text-brand font-semibold text-sm disabled:opacity-50"
            >
              {submit.isPending ? "Sending…" : "Send"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
