import { redirect } from "next/navigation";

export default function TicketsRedirect() {
  redirect("/contact-centre?tab=tickets");
}
