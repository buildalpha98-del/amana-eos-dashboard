import { redirect } from "next/navigation";

/**
 * 2026-07-05 nav consolidation phase 2: family messaging now lives as
 * the "Messages" tab on /contact-centre so every parent-communication
 * surface has one front door. This stub keeps old links alive.
 */
export default function MessagingPage() {
  redirect("/contact-centre?tab=messages");
}
