import type { Metadata } from "next";
import type { ReactNode } from "react";
import styles from "./enrolment.module.css";

export const metadata: Metadata = {
  title: "Your family’s enrolment | Amana OSHC",
  robots: { index: false, follow: false },
};

export default function EnrolmentLayout({ children }: { children: ReactNode }) {
  // No Meta Pixel here (security brief batch 5, 2026-10-21): this form holds
  // children's medical, family and bank details, and a third-party script has
  // no place on it. The conversion fires on the thank-you page only.
  return (
    <div className={styles.enrolment}>
      {children}
    </div>
  );
}
