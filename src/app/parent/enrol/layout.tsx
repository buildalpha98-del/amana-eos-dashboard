import type { Metadata } from "next";
import type { ReactNode } from "react";
import styles from "./enrolment.module.css";

export const metadata: Metadata = {
  title: "Your family’s enrolment | Amana OSHC",
  robots: { index: false, follow: false },
};

export default function EnrolmentLayout({ children }: { children: ReactNode }) {
  return <div className={styles.enrolment}>{children}</div>;
}
