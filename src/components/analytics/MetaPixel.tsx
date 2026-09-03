import Script from "next/script";

/**
 * Meta Pixel — same pixel as amanaoshc.com.au (id supplied by Jayden,
 * 25 Aug 2026), rendered ONLY on public marketing-facing pages (the /enrol
 * layout and /parent/signup): the admin dashboard must never feed staff
 * sessions into ad audiences. Production only, so localhost, preview
 * deploys, and the nightly E2E runs never inject fake PageViews into the
 * ad-attribution data.
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
