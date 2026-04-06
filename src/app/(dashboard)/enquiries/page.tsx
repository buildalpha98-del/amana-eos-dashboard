import { redirect } from "next/navigation";

export default function EnquiriesRedirect() {
  redirect("/contact-centre?tab=enquiries");
}
