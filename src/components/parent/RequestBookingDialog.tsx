"use client";

import { useState } from "react";
import { Calendar, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import {
  useParentChildren,
  useRequestBooking,
  type ParentChild,
} from "@/hooks/useParentPortal";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/fetch-api";
import {
  DEFAULT_ROOMS,
  SESSION_KEYS,
  formatTime,
  roomLabel,
  type SessionTimes,
} from "@/lib/service-settings";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Session codes stay bsc/asc/vc on the wire — they're written into every
 * booking in the system. What a parent SEES is the centre's own room
 * name, which each service sets for itself: "Rise and Shine", not "BSC".
 */
interface Centre {
  id: string;
  sessionTimes?: SessionTimes | null;
}

export function RequestBookingDialog({ open, onOpenChange }: Props) {
  const { data: children } = useParentChildren();
  const requestBooking = useRequestBooking();

  // Only fetched while the dialog is open — a booking form shouldn't
  // cost a request on every portal page load.
  const { data: centreData } = useQuery<{ centres: Centre[] }>({
    queryKey: ["parent", "centres"],
    queryFn: () => fetchApi("/api/parent/centres"),
    enabled: open,
    retry: 1,
  });

  const [selectedChild, setSelectedChild] = useState<ParentChild | null>(null);
  const [date, setDate] = useState("");
  const [sessionType, setSessionType] = useState<"bsc" | "asc" | "vc" | "">("");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  const resetForm = () => {
    setSelectedChild(null);
    setDate("");
    setSessionType("");
  };

  const handleSubmit = () => {
    if (!selectedChild || !date || !sessionType) return;

    requestBooking.mutate(
      {
        childId: selectedChild.id,
        serviceId: selectedChild.serviceId,
        date,
        sessionType,
      },
      {
        onSuccess: () => {
          resetForm();
          onOpenChange(false);
        },
      }
    );
  };

  const isValid = selectedChild && date && sessionType;

  // The rooms belong to the CHILD's centre — siblings at different
  // campuses can have different room names and hours.
  const sessionTimes =
    (centreData?.centres.find((c) => c.id === selectedChild?.serviceId)
      ?.sessionTimes as SessionTimes | null | undefined) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Request Casual Booking</DialogTitle>
        <DialogDescription>
          Select a child, date, and session type for the booking.
        </DialogDescription>

        <div className="space-y-5 mt-4">
          {/* Child selector */}
          <div>
            <label className="block text-xs font-medium text-foreground/70 mb-2">
              Child
            </label>
            <div className="space-y-2">
              {(children ?? []).map((child) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => setSelectedChild(child)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all min-h-[44px]",
                    selectedChild?.id === child.id
                      ? "border-brand bg-brand/5"
                      : "border-border hover:border-brand/30"
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center text-xs font-bold text-brand">
                    {child.firstName[0]}
                    {child.lastName[0]}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">
                      {child.firstName} {child.lastName}
                    </p>
                    <p className="text-xs text-muted">{child.serviceName}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Date picker */}
          <div>
            <label className="block text-xs font-medium text-foreground/70 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              min={minDate}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-border rounded-lg bg-background/50 text-sm text-foreground focus:outline-none focus:border-brand transition-colors min-h-[44px]"
            />
          </div>

          {/* Session type */}
          <div>
            <label className="block text-xs font-medium text-foreground/70 mb-2">
              Session Type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SESSION_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSessionType(key)}
                  className={cn(
                    "py-2.5 px-3 rounded-lg border-2 text-sm font-medium transition-all min-h-[44px] text-left",
                    sessionType === key
                      ? "border-brand bg-brand text-white"
                      : "border-border text-foreground hover:border-brand/30"
                  )}
                >
                  <span className="block leading-tight">
                    {roomLabel(sessionTimes, key)}
                  </span>
                  <span
                    className={cn(
                      "block text-xs leading-tight",
                      sessionType === key ? "text-white/75" : "text-muted",
                    )}
                  >
                    {formatTime(
                      sessionTimes?.[key]?.start ?? DEFAULT_ROOMS[key].start,
                    )}{" "}
                    –{" "}
                    {formatTime(
                      sessionTimes?.[key]?.end ?? DEFAULT_ROOMS[key].end,
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!isValid || requestBooking.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-brand hover:bg-brand-hover text-white text-base font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          >
            {requestBooking.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4" />
                Request Booking
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
