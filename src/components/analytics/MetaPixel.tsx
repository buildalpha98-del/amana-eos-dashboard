import Script from "next/script";

/**
 * Meta Pixel — same pixel as amanaoshc.com.au (id supplied by Jayden,
 * 25 Aug 2026), rendered ONLY on public family-facing pages (/enrol,
 * /parent/signup, /parent/login and the whole /parent/enrol form incl.
 * thank-you — the ad funnel end to end, 17 Oct 2026): the admin dashboard must never feed staff
 * sessions into ad audiences. Production only, so localhost, preview
 * deploys, and the nightly E2E runs never inject fake PageViews into the
 * ad-attribution data.
 *
 * autoConfig is OFF (2026-10-17): Meta's automatic events scrape button
 * text and form metadata, and the enrolment form holds children's medical
 * details. Meta gets PageViews plus the named events we fire ourselves —
 * Lead (family account created, parent/signup) and CompleteRegistration
 * (enrolment submitted, parent/enrol/thank-you) — nothing else.
 *
 * Never render this on a page whose URL carries a token (magic-link
 * confirm, password reset): the pixel sends the page URL to Meta.
 *
 * The pixel's facebook hosts are CSP-allow-listed per-route in
 * next.config.ts (metaPixel: true entries) — rendering this component on a
 * new page means adding that route there too, or fbevents.js is blocked.
 */
const META_PIXEL_ID = "1089374306929648";

export function MetaPixel() {
  if (process.env.NODE_ENV !== "production") return null;
  return (
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
fbq('set', 'autoConfig', false, '${META_PIXEL_ID}');
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
  );
}

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/** Fire a named Meta event if the pixel is on the page (production only). */
export function trackMetaEvent(event: "Lead" | "CompleteRegistration"): void {
  try {
    window.fbq?.("track", event);
  } catch {
    // Tracking must never break the family's flow.
  }
}
