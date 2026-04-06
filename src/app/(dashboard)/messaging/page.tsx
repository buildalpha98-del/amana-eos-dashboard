"use client";

import { MessagingInbox } from "@/components/messaging/MessagingInbox";

export default function MessagingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#1a1a2e]">
          Messages
        </h1>
        <p className="text-sm text-[#7c7c8a] mt-1">
          Communicate with families across your services.
        </p>
      </div>
      <MessagingInbox />
    </div>
  );
}
