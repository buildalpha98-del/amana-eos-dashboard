import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Meta Pixel host allowances. Appended to the CSP ONLY for the routes that
// actually render <MetaPixel /> (/enrol, /parent/signup) via the extra
// headers() entries below — the authenticated dashboard keeps the stricter
// policy, so an XSS on a staff page never gets a pre-approved facebook
// script host or exfiltration endpoint.
const securityHeaders = (opts: { metaPixel?: boolean } = {}) => [
  // Prevent clickjacking from OTHER origins. SAMEORIGIN (was DENY)
  // lets the dashboard iframe its own PDF proxies — the staff payslip
  // viewer, contract viewer, and any future in-app PDF rendering all
  // depend on this. Third-party clickjacking is still blocked because
  // SAMEORIGIN refuses iframes from any other host.
  //
  // The matching CSP frame-ancestors directive below (now 'self') is
  // what modern browsers actually honour; X-Frame-Options is the
  // legacy fallback for older clients.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Prevent MIME type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Control referrer info
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Prevent XSS (legacy browsers)
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // Only allow HTTPS after first visit
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Restrict permissions/features
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // Content Security Policy
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // connect.facebook.net: Meta Pixel loader (fbevents.js) — pixel routes only
      `script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://*.vercel-scripts.com https://*.sentry.io${opts.metaPixel ? " https://connect.facebook.net" : ""}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // www.facebook.com: Meta Pixel event beacons (/tr) — pixel routes only
      `img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.vercel-storage.com${opts.metaPixel ? " https://www.facebook.com" : ""}`,
      // 2026-06-15: added vercel.com + blob.vercel-storage.com so the
      // @vercel/blob client can call its token-mint endpoint and upload
      // file bytes directly to Blob storage. AI Knowledge bulk-upload
      // was hanging at 0% because CSP blocked the connect.
      `connect-src 'self' https://vercel.com https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com https://*.vercel-storage.com https://*.vercel-analytics.com https://*.sentry.io https://*.upstash.io wss://ws-us3-e.pusher.com${opts.metaPixel ? " https://www.facebook.com" : ""}`,
      // frame-ancestors 'self' (was 'none'): pairs with the
      // X-Frame-Options change above. Allows /my-portal and /contracts
      // to iframe /api/my-portal/payslips/.../download and similar
      // same-origin PDF proxies; still refuses iframing from any
      // third-party host.
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Pin the workspace root: Turbopack otherwise infers it from lockfiles in
  // parent directories, which mis-resolved module lookups (a stray
  // ~/package-lock.json once dragged the root to the home dir).
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: ["jsdom", "mammoth", "@sparticuz/chromium", "puppeteer-core"],
  // @sparticuz/chromium loads its brotli-compressed binaries from disk at
  // runtime (paths are constructed dynamically), so Next.js's file tracer
  // doesn't include them in the function bundle by default. Force the include
  // for the one route that actually renders PDFs — otherwise the function
  // crashes on Vercel with "The input directory ... chromium/bin does not
  // exist. Please provide the location of the brotli files."
  outputFileTracingIncludes: {
    "/api/contracts/issue-from-template": [
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders(),
      },
      // Meta Pixel routes: same headers with the facebook hosts appended.
      // Next applies matching entries in order and the LAST value for a
      // header key wins, so these override the catch-all's CSP for exactly
      // the pages that render <MetaPixel /> (see
      // src/components/analytics/MetaPixel.tsx).
      {
        source: "/enrol/:path*",
        headers: securityHeaders({ metaPixel: true }),
      },
      {
        source: "/parent/signup",
        headers: securityHeaders({ metaPixel: true }),
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
