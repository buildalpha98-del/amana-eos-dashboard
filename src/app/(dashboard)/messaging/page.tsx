"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { MessagingInbox } from "@/components/messaging/MessagingInbox";

export default function MessagingPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Messages"
        description="Communicate with families across your services"
      />
      <MessagingInbox />
    </div>
  );
}
