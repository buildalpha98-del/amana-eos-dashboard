"use client";

/**
 * Where each child is right now — the 3:30pm question.
 *
 * "Did he get signed in?" and "has she been picked up?" are the reasons
 * parents open this app during the day, and the answer lived three
 * screens deep inside attendance history. One line per child, on Home,
 * only on days something has actually happened.
 *
 * Renders NOTHING when no child has a sign-in today: on a quiet Sunday
 * the strip would only ever say "no news", and a card that usually says
 * nothing teaches people to skip it.
 */

import { useQuery } from "@tanstack/react-query";
import { LogIn, LogOut } from "lucide-react";
import { fetchApi } from "@/lib/fetch-api";
import { programmeName } from "@/lib/programme-names";

interface TodaySession {
  sessionType: string;
  signInTime: string | null;
  signOutTime: string | null;
  signedInByName: string | null;
  signedOutByName: string | null;
}

interface TodayChild {
  id: string;
  firstName: string;
  sessions: TodaySession[];
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-AU", {
    hour: "numeric",
    minute: "2-digit",
  });

export function TodayStrip() {
  const { data } = useQuery<{ children: TodayChild[] }>({
    queryKey: ["parent", "today"],
    queryFn: () => fetchApi("/api/parent/today"),
    // The answer changes at drop-off and pick-up, so keep it fresh when
    // the app is open across those moments.
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  const withNews = (data?.children ?? [])
    .map((c) => ({
      ...c,
      sessions: c.sessions.filter((s) => s.signInTime),
    }))
    .filter((c) => c.sessions.length > 0);

  if (withNews.length === 0) return null;

  return (
    <section
      aria-label="Today"
      className="bg-card rounded-xl p-4 shadow-sm border border-border"
    >
      <h2 className="text-sm font-heading font-semibold text-muted uppercase tracking-wider mb-2">
        Today
      </h2>
      <div className="space-y-2">
        {withNews.flatMap((c) =>
          c.sessions.map((s) => {
            const signedOut = Boolean(s.signOutTime);
            return (
              <div
                key={`${c.id}-${s.sessionType}`}
                className="flex items-start gap-2.5"
              >
                <span
                  className={
                    "mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 " +
                    (signedOut
                      ? "bg-surface text-muted"
                      : "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300")
                  }
                >
                  {signedOut ? (
                    <LogOut className="w-3.5 h-3.5" />
                  ) : (
                    <LogIn className="w-3.5 h-3.5" />
                  )}
                </span>
                <p className="text-sm text-foreground leading-snug">
                  <strong>{c.firstName}</strong>
                  {signedOut ? (
                    <>
                      {" "}was picked up at {time(s.signOutTime!)}
                      {s.signedOutByName ? ` by ${s.signedOutByName}` : ""}
                    </>
                  ) : (
                    <>
                      {" "}is at {programmeName(s.sessionType)} — signed in at{" "}
                      {time(s.signInTime!)}
                      {s.signedInByName ? ` by ${s.signedInByName}` : ""}
                    </>
                  )}
                </p>
              </div>
            );
          }),
        )}
      </div>
    </section>
  );
}
