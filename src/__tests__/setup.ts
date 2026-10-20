// Test setup — extend with @testing-library/jest-dom matchers
import "@testing-library/jest-dom/vitest";

// Parent emails read centre details from the live website
// (src/lib/website-centres.ts). Tests must never reach the network: by default
// the website "has nothing", and the dashboard's own settings are used. A test
// that wants website data mocks websiteCentre itself.
import { vi } from "vitest";
vi.mock("@/lib/website-centres", async (orig) => ({
  ...((await orig()) as object),
  websiteCentre: vi.fn(async () => null),
}));
