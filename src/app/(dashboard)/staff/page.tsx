/**
 * 2026-07-08: /staff was the old name for the team list, renamed
 * to /team. Detail pages still live at /staff/[id] (unchanged), but
 * the plain /staff URL 404'd — which broke the breadcrumb "Staff"
 * link on the profile page. Redirect keeps old bookmarks working.
 */
import { redirect } from "next/navigation";

export default function StaffListRedirect(): never {
  redirect("/team");
}
