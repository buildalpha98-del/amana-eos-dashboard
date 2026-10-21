# Production dependency advisories

Security brief 2026-10-21, batch 3 (finding S05). Fresh `npm audit --omit=dev` on 21 Oct 2026.

## Before and after

| | Total | Critical | High | Moderate | Low |
| --- | --- | --- | --- | --- | --- |
| Before (lockfile on `main`) | 60 | 4 | 18 | 37 | 1 |
| After this batch | 10 | 0 | 7 | 3 | 0 |

The counts include dependency chains; they aren't independent exploits.

## Changes

| Package | From | To | Why |
| --- | --- | --- | --- |
| `next` | 16.2.10 | 16.4.2 | Critical and high App Router advisories (proxy/middleware bypass, Server Actions denial of service and SSRF, image optimisation). Latest 16.x. |
| `next-auth` | 4.24.14 | 4.24.15 | Patched 4.x. Email normalisation, `getToken` malformed-header crash, OAuth check cookies. |
| `@auth/prisma-adapter` | 2.11.1 | **removed** | Nothing imports it. Removing it also drops `@auth/core`. |
| `sharp` | 0.34.5 | 0.35.5 | libvips/libheif/librsvg advisories. Used for image uploads and coordinator photos. A real resize and re-encode was checked locally (libvips 8.18.7). |
| `@tiptap/*` (9 packages) | 3.22.5 | 3.32.0 | `mergeAttributes` prototype key, Markdown ReDoS, and `prosemirror-view` paste XSS. Moved in lockstep (they peer-pin each other). |
| `puppeteer-core` | 24.42.0 | 24.43.1 | Latest 24.x. 24.43 removed `networkidle0` for `setContent`, so the contract renderer now waits for `load` plus `document.fonts.ready`. |
| transitive | — | in-range | `npm audit fix` **without** `--force`: undici, postcss, fast-uri, follow-redirects, brace-expansion, browserslist, xmldom, dompurify, uuid, fflate and others. |

Dev-only packages that moved during the reinstall (`eslint-plugin-react-hooks` 7.0.1→7.1.1, `fastq`) were pinned back to `main`'s versions. The newer react-hooks plugin adds rules that flag 50 existing call sites, which is lint work unrelated to security. `eslint-config-next` stays at 16.1.6 for the same reason.

## Accepted residuals

These are listed in `security/advisory-exceptions.json`. `scripts/check-advisories.mjs` fails on any unaccepted high or critical advisory and on any expired exception. Run it locally with `node scripts/check-advisories.mjs`.

**CI job, not yet added.** The saved GitHub token can't change workflow files, so Daniel needs to add this job to `.github/workflows/test.yml` (above `unit:`):

```yaml
  advisories:
    name: Dependency advisories
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
      - name: npm audit (production) vs accepted exceptions
        run: node scripts/check-advisories.mjs
```

| Chain | Severity | Why it isn't reachable | Fix path | Owner | Review by |
| --- | --- | --- | --- | --- | --- |
| `puppeteer-core` → `@puppeteer/browsers` → `extract-zip`, `proxy-agent` → `pac-proxy-agent` → `get-uri` → `basic-ftp` | high | The vulnerable code only runs when installing or downloading a browser. Contract PDFs always launch the bundled `@sparticuz/chromium` executable, pinned by `src/__tests__/lib/render-contract-launch.test.ts`. | `puppeteer-core` 25 needs Node ≥22.12. CI runs Node 20; move CI and Vercel to Node 22 first, then upgrade Puppeteer and `@sparticuz/chromium` together. | Daniel | 2027-01-31 |
| `mammoth` → `argparse` → `sprintf-js` | moderate | `argparse` is only used by mammoth's CLI (`bin/mammoth`). The app calls `convertToHtml` and `extractRawText`. | npm proposes a major *downgrade* of mammoth, so not taken. Watch for a mammoth release that drops `argparse`. | Daniel | 2027-01-31 |

## Verified after the upgrade (local, synthetic data)

- **Sign-in:** a wrong password is refused and the right one signs in on next-auth 4.24.15.
- **Revocation:** after a local `tokenVersion` bump, the session is empty, `/api/hq` returns 401 and pages redirect to login.
- **Release checks:** type check clean; lint 0 errors; full Vitest suite passes apart from the three known `localStorage` files; `next build` passes on 16.4.2.
- **Images:** sharp 0.35.5 resizes and re-encodes, and the upload-image and coordinator-photo tests pass.
- **Contract PDFs:** the unit tests pass. A real Chromium render can't run on macOS (`@sparticuz/chromium` is Linux-only), so **check one contract PDF on the preview or staging deployment**.
- **MFA:** covered by the existing unit tests only. No MFA-enrolled local account was exercised.
- **Not exercised:** the parent enrolment flow and AI flows on the new versions (the parent app is closed, and real AI provider calls are deliberately avoided). Covered by unit tests only.

## Deployed versions

To be recorded from the preview deployment once it builds: the commit and the `next`, `next-auth` and `sharp` versions reported by the build log.
