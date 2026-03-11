"use client";

import { Phone, Mail, MessageCircle, Globe, UserCheck, Users } from "lucide-react";

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
}

export function EnquiryCard({ enquiry, onClick }: EnquiryCardProps) {
  const daysInStage = Math.round(
    (Date.now() - new Date(enquiry.stageChangedAt).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  const isStuck = daysInStage > 2;
  const ChannelIcon = CHANNEL_ICONS[enquiry.channel] || Mail;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border p-3 cursor-pointer hover:shadow-md transition-shadow ${
        isStuck ? "border-red-400 border-l-4" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {enquiry.parentName}
        </p>
        <ChannelIcon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
      </div>

      {enquiry.childName && (
        <p className="text-xs text-gray-500 mb-1 truncate">
          Child: {enquiry.childName}
        </p>
      )}

      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 truncate">
          {enquiry.service?.name?.replace("Amana OSHC ", "") || "Unknown"}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {enquiry.parentDriver && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                DRIVER_COLOURS[enquiry.parentDriver] || "bg-gray-100 text-gray-600"
              }`}
            >
              {enquiry.parentDriver.replace("_", " ")}
            </span>
          )}
        </div>
        <span
          className={`text-[10px] font-medium ${
            isStuck ? "text-red-600" : "text-gray-400"
          }`}
        >
          {daysInStage}d
        </span>
      </div>

      {enquiry.nextActionDue && (
        <p className="text-[10px] text-gray-400 mt-1">
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
