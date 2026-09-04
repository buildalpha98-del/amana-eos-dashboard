import type { Metadata } from "next";
import { NotificationsInboxContent } from "@/components/notifications/NotificationsInboxContent";

export const metadata: Metadata = {
  title: "Notifications",
};

export default function NotificationsPage() {
  return <NotificationsInboxContent />;
}
