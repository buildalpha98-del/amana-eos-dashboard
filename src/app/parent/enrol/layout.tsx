import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Your family’s enrolment | Amana OSHC",
  robots: { index: false, follow: false },
};

export default function EnrolmentLayout({ children }: { children: ReactNode }) {
  return children;
}
