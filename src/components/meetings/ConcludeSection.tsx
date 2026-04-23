"use client";

import { useMemo } from "react";
import { Star } from "lucide-react";
import type { MeetingAttendee } from "@/hooks/useMeetings";
import { cn } from "@/lib/utils";

export function ConcludeSection({
  notes,
  onUpdate,
  cascadeMessages,
  onUpdateCascade,
  rating,
  onRate,
  attendees,
  attendeeRatings,
  onAttendeeRate,
}: {
  notes: string;
  onUpdate: (val: string) => void;
  cascadeMessages: string;
  onUpdateCascade: (val: string) => void;
  rating: number | null;
  onRate: (val: number) => void;
  attendees?: MeetingAttendee[];
  attendeeRatings?: Record<string, number>;
  onAttendeeRate?: (userId: string, rating: number) => void;
}) {
  const presentAttendees = attendees?.filter((a) => a.status === "present") || [];
  const hasAttendees = presentAttendees.length > 0;

  // Compute average from attendee ratings
  const avgRating = useMemo(() => {
    if (!attendeeRatings || !hasAttendees) return null;
    const ratings = Object.values(attendeeRatings).filter((v) => v > 0);
    if (ratings.length === 0) return null;
    return Math.round((ratings.reduce((sum, v) => sum + v, 0) / ratings.length) * 10) / 10;
  }, [attendeeRatings, hasAttendees]);

  return (
    <div className="space-y-6">
      <div className="bg-brand/10 border border-brand/20 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-brand mb-1">
          Conclude
        </h4>
        <p className="text-xs text-brand/70">
          Recap to-dos created, confirm who does what by when. Capture cascade
          messages for the broader team. Then rate the meeting 1-10.
        </p>
      </div>

      {/* Notes */}
      <div>
        <label className="text-sm font-medium text-foreground/80 mb-1.5 block">
          Recap Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => onUpdate(e.target.value)}
          placeholder="Summary of action items, decisions made, and key takeaways..."
          className="w-full h-32 p-3 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
        />
      </div>

      {/* Cascade Messages */}
      <div>
        <label className="text-sm font-medium text-foreground/80 mb-1.5 block">
          Cascade Messages
        </label>
        <p className="text-xs text-muted mb-2">
          Key messages to share with the broader team after this meeting.
        </p>
        <textarea
          value={cascadeMessages}
          onChange={(e) => onUpdateCascade(e.target.value)}
          placeholder="Messages to cascade to the team...&#10;&#10;Example:&#10;- New enrolment policy starts next Monday&#10;- Holiday program bookings open this Friday&#10;- Staff training day confirmed for March 15"
          className="w-full h-32 p-3 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
        />
      </div>

      {/* Rating — Per-attendee or single */}
      <div>
        <label className="text-sm font-medium text-foreground/80 mb-3 block">
          Rate This Meeting
        </label>

        {hasAttendees && onAttendeeRate ? (
          <div className="space-y-3">
            {/* Average display */}
            {avgRating !== null && (
              <div className="flex items-center gap-2 p-3 bg-brand/5 border border-brand/20 rounded-lg">
                <Star className="w-5 h-5 text-accent fill-accent" />
                <span className="text-lg font-bold text-brand">{avgRating}</span>
                <span className="text-xs text-muted">/10 average</span>
                <span className="text-xs text-muted ml-auto">
                  {Object.values(attendeeRatings || {}).filter((v) => v > 0).length}/{presentAttendees.length} rated
                </span>
              </div>
            )}

            {/* Per-attendee rating rows */}
            <div className="space-y-2">
              {presentAttendees.map((attendee) => {
                const userRating = attendeeRatings?.[attendee.userId] || 0;
                return (
                  <div key={attendee.userId} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">
                        {attendee.user.name}
                      </span>
                      {userRating > 0 && (
                        <span className={cn(
                          "text-xs font-semibold px-2 py-0.5 rounded-full",
                          userRating >= 8
                            ? "bg-emerald-100 text-emerald-700"
                            : userRating >= 5
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                        )}>
                          {userRating}/10
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          onClick={() => onAttendeeRate(attendee.userId, n)}
                          className={cn(
                            "w-8 h-8 rounded-md border text-xs font-bold transition-all",
                            userRating === n
                              ? "border-accent bg-accent text-brand scale-105 shadow-sm"
                              : n <= userRating
                              ? "border-accent/50 bg-accent/20 text-brand"
                              : "border-border bg-card text-muted hover:border-accent/50 hover:text-foreground"
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => onRate(n)}
                  className={cn(
                    "w-10 h-10 rounded-lg border-2 text-sm font-bold transition-all",
                    rating === n
                      ? "border-accent bg-accent text-brand scale-110 shadow-md"
                      : n <= (rating || 0)
                      ? "border-accent/50 bg-accent/20 text-brand"
                      : "border-border bg-card text-muted hover:border-accent/50 hover:text-foreground"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            {rating && (
              <p className="text-xs text-muted mt-2">
                {rating >= 8
                  ? "Great meeting! Keep it up."
                  : rating >= 5
                  ? "Good meeting. Look for ways to improve."
                  : "Below average. Discuss how to improve next week."}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
