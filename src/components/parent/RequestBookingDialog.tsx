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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SESSION_OPTIONS = [
  { value: "bsc" as const, label: "BSC", fullLabel: "Before School Care" },
  { value: "asc" as const, label: "ASC", fullLabel: "After School Care" },
  { value: "vc" as const, label: "VC", fullLabel: "Vacation Care" },
];

export function RequestBookingDialog({ open, onOpenChange }: Props) {
  const { data: children } = useParentChildren();
  const requestBooking = useRequestBooking();

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
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-2">
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
                      ? "border-[#004E64] bg-[#004E64]/5"
                      : "border-[#e8e4df] hover:border-[#004E64]/30"
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-[#004E64]/10 flex items-center justify-center text-xs font-bold text-[#004E64]">
                    {child.firstName[0]}
                    {child.lastName[0]}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-[#1a1a2e]">
                      {child.firstName} {child.lastName}
                    </p>
                    <p className="text-xs text-[#7c7c8a]">{child.serviceName}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Date picker */}
          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              min={minDate}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-[#e8e4df] rounded-lg bg-[#FAF8F5]/50 text-sm text-[#1a1a2e] focus:outline-none focus:border-[#004E64] transition-colors min-h-[44px]"
            />
          </div>

          {/* Session type */}
          <div>
            <label className="block text-xs font-medium text-[#1a1a2e]/70 mb-2">
              Session Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SESSION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSessionType(opt.value)}
                  className={cn(
                    "py-2.5 px-3 rounded-lg border-2 text-sm font-medium transition-all min-h-[44px]",
                    sessionType === opt.value
                      ? "border-[#004E64] bg-[#004E64] text-white"
                      : "border-[#e8e4df] text-[#1a1a2e] hover:border-[#004E64]/30"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!isValid || requestBooking.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#004E64] hover:bg-[#003D52] text-white text-base font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
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
