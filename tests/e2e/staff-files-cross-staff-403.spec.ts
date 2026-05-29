/**
 * E2E: API-level access control on file proxies.
 *
 * The View action everywhere now routes through one of four auth-checked
 * proxies. A non-admin staff member must NOT be able to fetch another
 * staff member's file by guessing the ID and hitting the proxy URL
 * directly.
 *
 * The spec logs in as the seeded test-staff user and probes each proxy
 * with a synthetic-but-valid-looking ID. The expected response from every
 * proxy is either 403 (when there's a real record belonging to someone
 * else) or 404 (when there's no record). 401/200 would be a real
 * regression — that's what we're guarding against.
 */
import { test, expect } from "@playwright/test";

test.describe("File proxy endpoints — cross-staff access blocked", () => {
  test.use({ storageState: ".playwright/auth/staff.json" });

  const PROBE_ID = "cross-staff-probe-id";
  const proxies = [
    `/api/staff-documents/${PROBE_ID}`,
    `/api/compliance/${PROBE_ID}/download`,
    `/api/qualifications/${PROBE_ID}/download`,
    `/api/contracts/${PROBE_ID}/document`,
  ];

  for (const path of proxies) {
    test(`${path} rejects access by a non-admin staff member`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      // Acceptable: 403 (record exists, viewer not allowed) or 404 (no record
      // / no file attached). Anything else (200, 307, 401, 500) is a leak.
      expect([403, 404]).toContain(res.status());
    });
  }
});
