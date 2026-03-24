"use client";

import { Phone, Mail, MessageCircle, Globe, UserCheck, Users, Clock } from "lucide-react";

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  phone: Phone,
  email: Mail,
  whatsapp: MessageCircle,
  walkin: Users,
  referral: UserCheck,
  website: Globe,
};

const DRIVER_COLOURS: Record<string, string> = {
  homework: "bg-blue-100 text-blue-700",
  quran: "bg-emerald-100 text-emerald-700",
  enrichment: "bg-purple-100 text-purple-700",
  working_parent: "bg-amber-100 text-amber-700",
  traffic: "bg-orange-100 text-orange-700",
  sports: "bg-green-100 text-green-700",
};

interface EnquiryCardProps {
  enquiry: any;
  onClick: () => void;
  waitlistPosition?: number;
}

function getOfferCountdown(offeredAt: string): string | null {
  const offered = new Date(offeredAt).getTime();
  // 48-hour offer window
  const expiresAt = offered + 48 * 60 * 60 * 1000;
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "Expired";
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  if (hours >= 1) return `${hours}h remaining`;
  const mins = Math.floor(remaining / (1000 * 60));
  return `${mins}m remaining`;
}

export function EnquiryCard({ enquiry, onClick, waitlistPosition }: EnquiryCardProps) {
  const daysInStage = Math.round(
    (Date.now() - new Date(enquiry.stageChangedAt).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  const isStuck = daysInStage > 2;
  const ChannelIcon = CHANNEL_ICONS[enquiry.channel] || Mail;
  const isWaitlisted = enquiry.stage === "waitlisted";
  const hasOffer = isWaitlisted && enquiry.waitlistOfferedAt;

  return (
    <div
      onClick={onClick}
      className={`bg-card rounded-lg border p-3 cursor-pointer hover:shadow-md transition-shadow ${
        isStuck && !isWaitlisted
          ? "border-red-400 border-l-4"
          : isWaitlisted
          ? "border-amber-300 border-l-4 border-l-amber-400"
          : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {waitlistPosition != null && (
            <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold">
              #{waitlistPosition}
            </span>
          )}
          <p className="text-sm font-semibold text-foreground truncate">
            {enquiry.parentName}
          </p>
        </div>
        <ChannelIcon className="h-3.5 w-3.5 text-muted flex-shrink-0" />
      </div>

      {enquiry.childName && (
        <p className="text-xs text-muted mb-1 truncate">
          Child: {enquiry.childName}
        </p>
      )}

      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted truncate">
          {enquiry.service?.name?.replace("Amana OSHC ", "") || "Unknown"}
        </span>
      </div>

      {/* Waitlist offer status */}
      {hasOffer && (
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
            Offered
          </span>
          <span className="text-[10px] text-muted flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {getOfferCountdown(enquiry.waitlistOfferedAt)}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {enquiry.parentDriver && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                DRIVER_COLOURS[enquiry.parentDriver] || "bg-surface text-muted"
              }`}
            >
              {enquiry.parentDriver.replace("_", " ")}
            </span>
          )}
        </div>
        <span
          className={`text-[10px] font-medium ${
            isWaitlisted
              ? "text-amber-600"
              : isStuck
              ? "text-red-600"
              : "text-muted"
          }`}
        >
          {isWaitlisted ? `${daysInStage}d waiting` : `${daysInStage}d`}
        </span>
      </div>

      {enquiry.nextActionDue && (
        <p className="text-[10px] text-muted mt-1">
          Due:{" "}
          {new Date(enquiry.nextActionDue).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
          })}
        </p>
      )}
    </div>
  );
}
