# Employment Hero Payroll — API Key Rotation Runbook

**Owner:** Director (Daniel)
**Audience:** Anyone authorised to touch production Vercel env vars.
**Last reviewed:** 2026-06-01

---

## When to rotate

Rotate the EH Payroll API key in any of these situations:

1. **Routine (every 90 days).** Calendar this — pick the 1st of every
   quarter (Jan / Apr / Jul / Oct) and set a recurring reminder for
   the director.
2. **Personnel change.** Any time someone with access to the key
   (current or former contractor, departed admin, etc.) no longer
   needs it.
3. **Suspected exposure.** A repo leak, an accidentally-committed
   `.env` file, a screenshare that showed the value, a phishing
   attempt that name-dropped the key — any "could this have leaked"
   moment rotates immediately.
4. **Vendor advisory.** If Employment Hero notify of a credential
   exposure, rotate within the window they specify (usually 24h).

There is no "audit" or "compliance" floor that mandates rotation, but
treating an API key as a *secret with a TTL* is straightforward hygiene.

---

## What the key controls

The `EH_PAYROLL_API_KEY` env var holds an Employment Hero Payroll
(KeyPay-lineage) API key in HTTP Basic format. It authenticates every
server-side call we make to `https://api.yourpayroll.com.au` —
specifically:

- Employee list + per-employee lookups
- Payslip listing + PDF download proxy
- Leave request list (org-wide for admin, per-employee for staff)
- Leave application submissions from My Portal
- Expense claim creation + receipt attachment
- Daily employee-sync cron (`/api/cron/eh-payroll-sync-employees`)

Rotating the key does **not** invalidate any employee data — EH stores
that against the business, not against the key. The key is purely the
authentication credential.

---

## What the key does NOT control

These are intentionally **out of scope** for the same key, so they
don't need rotation in lockstep:

- `EH_PAYROLL_BUSINESS_ID` — the business identifier, public-ish, fine
  to keep stable
- `EH_PAYROLL_API_BASE` — the API URL, stable
- Any EH user account passwords (these are separate from API keys)
- Webhook secrets (if/when implemented — separate rotation runbook)

---

## Rotation procedure

> Estimated time: **5 minutes hands-on, 5 minutes verification.**
> Run this during business hours so failures are immediately visible.

### Step 1 — Generate the new key

1. Log in to Employment Hero Payroll as the business owner:
   <https://app.yourpayroll.com.au/>
2. Navigate to **Business** → **Payroll Settings** → **API Keys**.
   (If you don't see API Keys, you don't have owner-level access —
   stop here and escalate to whoever does.)
3. Click **Generate new key**. Label it with today's date:
   `dashboard-prod-YYYY-MM-DD`.
4. Copy the key value **immediately** — EH only shows it once.
5. Do NOT delete the old key yet. Both keys are valid for the
   transition window.

### Step 2 — Update Vercel

1. Open the Vercel dashboard for `amana-eos-dashboard`:
   <https://vercel.com/buildalpha98-dels-projects/amana-eos-dashboard>
2. Go to **Settings** → **Environment Variables**.
3. Find `EH_PAYROLL_API_KEY`. Click the **⋯** menu → **Edit**.
4. Paste the new key value. **Keep environment set to Production +
   Preview + Development** (or whichever the existing entry was).
5. Click **Save**.

### Step 3 — Trigger a redeploy

Environment variables don't apply to running deployments — you must
redeploy:

1. Go to **Deployments**.
2. Find the most recent production deployment.
3. Click **⋯** → **Redeploy**. Confirm.
4. Wait for the redeploy to go green (typically 2-3 min).

### Step 4 — Verify

Run these checks against the live site (logged in as an admin):

- **Settings → Payroll** → the connection-status card should show
  "Connected" with a recent timestamp.
- **Leave (Payroll)** page → loads the list without a red error
  banner.
- **My Portal → My Payslips** → loads the latest 12 payslips.
- **(Optional)** Manually run the employee sync — Settings → Payroll
  → **Run sync now**. Wait for it to report success.

If any of these fail with auth-related errors (401, "invalid
credentials"):

1. Double-check the value pasted in Vercel — look for trailing
   whitespace or accidental newline.
2. Confirm the redeploy actually happened (check the Deployments
   timestamp).
3. If still failing, **roll back** (see below) and start over.

### Step 5 — Revoke the old key

Only do this once verification passes:

1. Back in EH Payroll → API Keys.
2. Find the **previous** key (the one not labelled with today's date).
3. Click **Revoke**. Confirm.

This shuts the door behind the rotation. From now on the old key
returns 401 from EH.

### Step 6 — Update the rotation log

Append a line to `docs/runbooks/eh-payroll-key-rotation-log.md`:

```text
2026-06-01 — Rotated by Daniel. New key: dashboard-prod-2026-06-01.
              Reason: routine quarterly. Verified payslip + leave fetch.
```

(Create the file if it doesn't exist yet. Don't commit secrets — only
the timestamp + label + reason.)

---

## Rollback plan

If verification fails and you can't reach the right person to fix it:

1. **Don't revoke the old key in step 5.** Both keys are valid until
   you do.
2. In Vercel, paste the **old** key value back into `EH_PAYROLL_API_KEY`.
3. Redeploy.
4. Verify the site is healthy again.
5. Diagnose the issue with the new key out-of-band (paste error
   messages, check formatting, retry from step 1 of the procedure).

The rollback window closes the moment you revoke the old key in EH —
plan accordingly.

---

## Who needs to know

- **The director (Daniel)** — owns the rotation calendar and the
  EH owner account.
- **Whoever runs the rotation** — read this runbook end-to-end first.

You do NOT need to notify staff that a rotation happened — the
process is transparent to end-users. If verification fails and
my-portal payslip download breaks for some time window, staff will
notice; communicate then.

---

## Failure modes seen historically

None yet — this runbook was written 2026-06-01 alongside the EH
Payroll integration shipping. Add new failure modes here as we hit
them. Format:

```text
## YYYY-MM-DD — short title
What happened. What we did. How to avoid it next time.
```
