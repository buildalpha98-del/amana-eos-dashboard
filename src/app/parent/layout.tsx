import type { Metadata } from "next";
import { ParentShell } from "./ParentShell";

export const metadata: Metadata = {
  manifest: "/parent-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Amana Parents",
  },
};

export default function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ParentShell>{children}</ParentShell>;
}
