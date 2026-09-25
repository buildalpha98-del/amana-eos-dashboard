// Single source of truth for the welcome-tour dismissal flag.
//
// Lives in a pure module (no React imports) so the Playwright helpers can
// import it too: the tour modal opens 1.5s after load for any context
// without this flag and silently blocks every click, so the E2E suite
// stamps it before saving storage state (tests/e2e/helpers/session.ts).
// Renaming or versioning the key here keeps app and specs in lockstep.
export const TOUR_STORAGE_KEY = "amana-tour-completed";
