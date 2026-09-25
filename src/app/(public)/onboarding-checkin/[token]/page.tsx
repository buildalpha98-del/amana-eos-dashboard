"use client";

/**
 * /onboarding-checkin/[token] — the unauthenticated "how's it going"
 * response page a new starter lands on from their check-in email. No
 * login: the token in the URL is the whole access control, same model
 * as a password-reset link.
 */

import { use, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, Smile } from "lucide-react";
import { fetchApi, mutateApi } from "@/lib/fetch-api";

interface CheckInInfo {
  name: string;
  milestoneLabel: string;
  alreadySubmitted: boolean;
}

const MOODS = [
  { value: 1, label: "Struggling" },
  { value: 2, label: "Not great" },
  { value: 3, label: "Okay" },
  { value: 4, label: "Good" },
  { value: 5, label: "Great" },
];

export default function OnboardingCheckInPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { data, isLoading, error } = useQuery<CheckInInfo>({
    queryKey: ["onboarding-checkin", token],
    queryFn: () => fetchApi(`/api/public/onboarding-checkin/${token}`),
    retry: 1,
  });

  const [mood, setMood] = useState<number | null>(null);
  const [comments, setComments] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      mutateApi(`/api/public/onboarding-checkin/${token}`, {
        method: "POST",
        body: { mood, comments: comments.trim() || undefined },
      }),
    onSuccess: () => setSubmitted(true),
  });

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-sm p-6">
        {isLoading ? (
          <p className="text-sm text-muted text-center py-8">Loading…</p>
        ) : error || !data ? (
          <p className="text-sm text-muted text-center py-8">
            This link isn&apos;t valid or has expired.
          </p>
        ) : submitted || data.alreadySubmitted ? (
          <div className="text-center py-6">
            <CheckCircle2 className="w-10 h-10 mx-auto text-brand mb-3" />
            <h1 className="text-lg font-semibold text-foreground">Thanks for letting us know!</h1>
            <p className="text-sm text-muted mt-1">We really appreciate the feedback.</p>
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
                How&apos;s your {data.milestoneLabel} at Amana OSHC been, {data.name}?
              </h1>
            </div>
            <p className="text-sm text-muted mb-4">
              Takes a minute — anything you tell us here goes straight to the team.
            </p>

            <div className="flex justify-between gap-1.5 mb-4">
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMood(m.value)}
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

            <label className="text-xs text-muted block mb-1">
              Anything we could have done better with your onboarding? (optional)
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Tell us anything — good or bad"
            />

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
