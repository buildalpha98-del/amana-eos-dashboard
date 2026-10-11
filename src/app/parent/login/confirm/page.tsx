import type { Metadata } from "next";
import styles from "../../enrol/enrolment.module.css";
import { ConfirmLogin } from "./ConfirmLogin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Welcome back | Amana OSHC",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function ConfirmLoginPage() {
  return <div className={styles.enrolment}><ConfirmLogin /></div>;
}
