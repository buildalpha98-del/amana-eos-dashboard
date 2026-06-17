import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const securityHeaders = [
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
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://*.vercel-scripts.com https://*.sentry.io",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.vercel-storage.com",
      // 2026-06-15: added vercel.com + blob.vercel-storage.com so the
      // @vercel/blob client can call its token-mint endpoint and upload
      // file bytes directly to Blob storage. AI Knowledge bulk-upload
      // was hanging at 0% because CSP blocked the connect.
      "connect-src 'self' https://vercel.com https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com https://*.vercel-storage.com https://*.vercel-analytics.com https://*.sentry.io https://*.upstash.io wss://ws-us3-e.pusher.com",
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
        headers: securityHeaders,
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
