# Disaster Recovery Runbook — Amana OSHC EOS Dashboard

**Last updated:** March 2026
**System admin is the first responder for all incidents.**

---

## Infrastructure Overview

| Layer | Provider | Purpose |
|---|---|---|
| Hosting / Serverless / Cron | Vercel | App runtime, API routes, scheduled jobs |
| Database | Railway PostgreSQL | Primary data store |
| Rate limiting / Caching | Upstash Redis | API rate limits, caching |
| File storage | Vercel Blob | Document and file uploads |
| Transactional email | Resend / Brevo | Notifications, alerts |
| Financial sync | Xero | Accounting integration |

---

## 1. Recovery Priority Order

### P1 — Critical (restore within 1 hour)
- Authentication (NextAuth / credential login)
- Core dashboard (navigation, session management)
- Database connectivity (Prisma → Railway PostgreSQL)

### P2 — High (restore within 4 hours)
- Enquiry pipeline
- Compliance tracking and certificates
- Attendance recording

### P3 — Medium (restore within 24 hours)
- Financial reporting
- Marketing and communications
- AI assistant

### P4 — Low (restore within 48 hours)
- Historical reports
- Analytics
- Backup exports

---

## 2. Database Backup & Recovery

### Backup sources

| Source | Frequency | Retention | Location |
|---|---|---|---|
| Railway automatic backups | Daily | 7 days | Railway dashboard |
| CSV export via cron | Monthly | Until manually deleted | Vercel Blob |

The monthly CSV export is triggered by `/api/cron/backup-export` and covers: users, services, enquiries, rocks, and compliance certificates.

### Restore from Railway backup

1. Log in to [railway.app](https://railway.app) and open the Amana project.
2. Select the PostgreSQL service → **Backups** tab.
3. Choose a point-in-time snapshot and click **Restore**.
4. Wait for Railway to confirm the restore is complete.
5. Run schema alignment (in case of schema drift):
   ```bash
   npx prisma db push
   npx prisma generate
   ```
6. Trigger a Vercel redeploy to clear any cached connections.

### Restore from CSV backup (fallback — no Railway backup available)

See **Section 5: Critical Data Recovery Order** below.

To locate CSV backups:
- Open the Vercel project → **Storage** → **Blob**.
- Find files named `backup-export-*.csv` or similar, grouped by entity.

---

## 3. Application Recovery

### Normal redeploy (no data loss)

Vercel auto-deploys on every push to `main`. If the current deployment is broken:

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard) → select the Amana project.
2. Open **Deployments**.
3. Find the last known-good deployment and click **Promote to Production**.

### Corrupted main branch

If `main` itself contains bad code:

```bash
# Option A: revert a specific bad commit
git revert <bad-commit-sha>
git push origin main

# Option B: reset to last known-good commit (destructive — confirm first)
git reset --hard <last-good-sha>
git push --force origin main
```

Pushing to `main` triggers an automatic Vercel redeploy.

### Environment variables

All secrets are stored in **Vercel project settings → Environment Variables**. They are not committed to the repository. Required variables include:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Railway PostgreSQL connection string |
| `NEXTAUTH_SECRET` | NextAuth session signing |
| `NEXTAUTH_URL` | App base URL |
| `REDIS_URL` / `UPSTASH_REDIS_*` | Upstash Redis connection |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access |
| `RESEND_API_KEY` | Transactional email (Resend) |
| `BREVO_API_KEY` | Transactional email (Brevo) |
| `XERO_*` | Xero OAuth credentials |
| `CRON_SECRET` | Authenticates cron job requests |
| `API_KEY_*` | External API key auth |

If environment variables are lost, they must be re-entered manually in Vercel before the app will function. Keep a secure offline copy (e.g. in a password manager or encrypted vault) maintained by the system admin.

---

## 4. Service Dependency Failures

### Railway PostgreSQL is down

**Symptoms:** App returns 503 on health check; all database-backed pages fail.

**Steps:**
1. Check Railway status: [status.railway.app](https://status.railway.app)
2. If Railway is operational, restart the PostgreSQL service from the Railway dashboard.
3. If an outage is confirmed, wait for Railway auto-recovery and monitor the status page.
4. Once restored, verify app connectivity by loading the dashboard and checking `/api/health` (if implemented).

### Upstash Redis is down

**Symptoms:** API rate limiting may be degraded; cached data returns stale or uncached results.

**Behaviour:** The app is coded to fall back to in-memory rate limiting when Redis is unavailable. This provides reduced protection but does not cause a complete outage.

**Steps:**
1. Check Upstash status: [status.upstash.com](https://status.upstash.com)
2. No immediate action required unless abuse is detected during degraded mode.
3. Once Redis recovers, normal behaviour resumes automatically.

### Vercel Blob is down

**Symptoms:** File uploads fail with errors; document pages may not load new files.

**Behaviour:** Existing files already stored in Blob remain accessible. Only new uploads are affected.

**Steps:**
1. Check Vercel status: [vercel-status.com](https://vercel-status.com)
2. Notify users that file uploads are temporarily unavailable.
3. Retry failed uploads once the service is restored.

### Resend / Brevo is down

**Symptoms:** Transactional emails (notifications, alerts, invites) are not delivered.

**Behaviour:** Email sends may fail silently or return an error logged to Vercel function logs.

**Steps:**
1. Check provider status pages:
   - Resend: [resend.com/status](https://resend.com/status) (if available)
   - Brevo: [status.brevo.com](https://status.brevo.com)
2. If one provider is down, consider temporarily routing critical emails through the other (requires code change).
3. Review Vercel function logs for email error counts.
4. No data loss occurs — emails are simply not sent during the outage.

### Xero is down

**Symptoms:** Financial sync cron jobs fail; Xero-sourced data is stale.

**Behaviour:** The sync is cron-based. No data is lost — the next scheduled cron run will catch up automatically when Xero recovers.

**Steps:**
1. Check Xero status: [status.xero.com](https://status.xero.com)
2. No immediate action required.
3. After Xero recovers, manually trigger the sync cron if same-day data is critical (via Vercel dashboard → Cron Jobs → Run now).

---

## 5. Critical Data Recovery Order

Use this order when recovering from full database loss with no Railway backup available. Source data from the most recent CSV backup exports in Vercel Blob.

| Priority | Entity | Why |
|---|---|---|
| 1 | **Users** | Required for authentication — nothing works without valid user records |
| 2 | **Services** | Required for data scoping — most records are scoped to a service |
| 3 | **Compliance certificates** | Regulatory requirement; must be restored early |
| 4 | **Enquiries** | Business pipeline; revenue-impacting |
| 5 | **Rocks** | Strategic priorities; needed for EOS operations |
| 6+ | **All other data** | Reconstructible from source systems (Xero, attendance imports, manual re-entry) |

### CSV restore procedure

1. Download the relevant CSV files from Vercel Blob.
2. Use a PostgreSQL client (e.g. `psql`, TablePlus, or Railway's built-in query editor) to import records in the order above.
3. After importing, run:
   ```bash
   npx prisma db push
   npx prisma generate
   ```
4. Verify record counts and spot-check key records before restoring user access.

---

## 6. Contact & Escalation

| Service | Support |
|---|---|
| Railway | [railway.app/help](https://railway.app/help) |
| Vercel | [vercel.com/help](https://vercel.com/help) |
| Upstash | [upstash.com/support](https://upstash.com/support) |
| Resend | [resend.com](https://resend.com) |
| Brevo | [brevo.com](https://brevo.com) |
| Xero | [central.xero.com](https://central.xero.com) |

**Internal escalation:** The system admin is the first responder for all incidents. Ensure contact details for the system admin are stored offline and accessible without the dashboard being operational.

---

## 7. Post-Recovery Checklist

After any recovery event, verify the following before declaring the incident resolved:

- [ ] Dashboard loads and navigation works
- [ ] Login / logout works with a test account
- [ ] Database connectivity confirmed (check a data-heavy page)
- [ ] Cron jobs are scheduled and enabled in `vercel.json` / Vercel dashboard
- [ ] Environment variables are all present in Vercel project settings
- [ ] File uploads work (test with a small document)
- [ ] A test email is sent and received
- [ ] Rate limiting is active (Redis connected)
- [ ] Recent enquiry and compliance data matches expectations
- [ ] Incident is documented: date, cause, resolution, time to restore
