import * as Sentry from "@sentry/nextjs";

// The emailed login token arrives in a fragment. Instrumentation starts
// before React can remove it, so disable telemetry for this whole document.
// Successful sign-in performs a full navigation and resumes normal monitoring.
const isLoginConfirmation = typeof window !== "undefined" && window.location.pathname === "/parent/login/confirm";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: process.env.NODE_ENV === "production" ? 1.0 : 0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && !isLoginConfirmation,
});
