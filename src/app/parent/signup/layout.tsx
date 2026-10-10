import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Create your parent account | Amana OSHC",
  description:
    "Create your Amana parent account to start enrolment. Our team is here to help.",
  robots: { index: false, follow: true },
};
export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
