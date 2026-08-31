import type { Metadata } from "next";
import Script from "next/script";

/**
 * Meta Pixel — same pixel as amanaoshc.com.au (id supplied by Jayden,
 * 25 Aug 2026), scoped to the PUBLIC enrolment wizard only: the admin
 * dashboard must never feed staff sessions into ad audiences. Production
 * only so previews/localhost stay clean. The wizard fires
 * CompleteRegistration on successful submission (EnrolmentWizard.tsx).
 */
const META_PIXEL_ID = "1089374306929648";

export const metadata: Metadata = {
  title: "Enrolment Form — Amana OSHC",
  description: "Complete your child's enrolment at Amana Out of School Hours Care.",
};

export default function EnrolLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001824] via-[#003344] to-[#0A5E7E]">
      {process.env.NODE_ENV === "production" && (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              alt=""
              src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}
      {/* Header */}
      <header className="sticky top-0 z-30 bg-brand-dark/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <img src="/logo-full-white.svg" alt="Amana OSHC" className="h-8" />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-8 pb-24">
        {children}
      </main>

      {/* Footer */}
      <footer className="text-center text-white/40 text-xs py-6">
        Amana OSHC &copy; {new Date().getFullYear()}. All rights reserved.
      </footer>
    </div>
  );
}
