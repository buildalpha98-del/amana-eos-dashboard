import type { Metadata, Viewport } from "next";
import { DM_Sans, Bricolage_Grotesque } from "next/font/google";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { Toaster } from "@/components/ui/toaster";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import "@/styles/print.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // maximumScale deliberately NOT set. Pinning it to 1 blocks pinch-zoom,
  // which fails WCAG 1.4.4 and hurts most on the enrolment form, where
  // parents transcribe card numbers, BSBs, CRNs and Medicare numbers.
  // It was there to stop iOS zoom-on-focus; the real fix for that is
  // 16px inputs, which the form now uses.
  themeColor: "#004E64",
};

export const metadata: Metadata = {
  title: "Amana OSHC — EOS Dashboard",
  description: "EOS Management Dashboard for Amana OSHC",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Amana OSHC",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192" },
      { url: "/icons/icon-512.png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/icon-192.png" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${bricolage.variable} antialiased`}>
        <SessionProvider>
          <QueryProvider>
            {children}
            <Toaster />
            <ServiceWorkerRegistrar />
            <SpeedInsights />
          </QueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
