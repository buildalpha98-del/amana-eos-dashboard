import type { Metadata } from "next";
import type { ReactNode } from "react";
import styles from "./enrolment.module.css";
import { MetaPixel } from "@/components/analytics/MetaPixel";

export const metadata: Metadata = {
  title: "Your family’s enrolment | Amana OSHC",
  robots: { index: false, follow: false },
};

export default function EnrolmentLayout({ children }: { children: ReactNode }) {
  // The pixel covers the whole form and the thank-you page, so Meta can see
  // families who start an enrolment, not only those who finish.
  return (
    <div className={styles.enrolment}>
      <MetaPixel />
      {children}
    </div>
  );
}
