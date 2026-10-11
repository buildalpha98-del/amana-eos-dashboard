import type { Metadata } from "next";
import { ParentShell } from "./ParentShell";

export const metadata: Metadata = {
  title: "Amana OSHC | Your family",
  description: "Your Amana family hub: enrolment, school information and support from our team.",
  manifest: "/parent-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    /**
     * The header is Midnight Green and now paints under the status bar
     * (viewport-fit: cover + a top safe-area inset on the header), so
     * the status bar has to be translucent with light glyphs or the
     * time and battery sit invisibly on navy.
     */
    statusBarStyle: "black-translucent",
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
