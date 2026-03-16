# Security Architecture — Amana OSHC EOS Dashboard

**Classification:** Internal — Regulatory Reference
**Last updated:** March 2026
**Applicable standards:** Australian Privacy Act 1988, ACECQA National Quality Framework, State/Territory regulatory requirements

---

## 1. Authentication Architecture

### Provider and Strategy

Authentication is implemented using **NextAuth.js** with a credentials provider. Sessions are issued as **JSON Web Tokens (JWT)** — no database session table is required, reducing the attack surface for session fixation.

| Parameter | Value |
|---|---|
| Session strategy | JWT (stateless) |
| Default session expiry | 24 hours |
| Maximum session age | 30 days (remember-me path) |
| Token signing | HS256 with `NEXTAUTH_SECRET` |

### Password Hashing

All passwords are hashed using **bcrypt** with a salt factor of **12 rounds** before storage. Plaintext passwords are never logged, stored, or transmitted. Password comparison uses bcrypt's constant-time compare to prevent timing attacks.

### Login Rate Limiting

Login attempts are rate-limited via **Upstash Redis** before any credential validation occurs:

- **Limit:** 5 attempts per 15-minute window, keyed by email address
- **Response on limit:** HTTP 429 with a `Retry-After` header
- The limit fires before the database is queried, preventing enumeration through timing differences

### Password Reset Flow

1. User submits their email address to the reset endpoint
2. The server responds with an identical success message regardless of whether the email exists (anti-enumeration)
3. If the account exists, a reset token is generated using `crypto.randomBytes(32)` and stored as a SHA-256 hash in the database
4. The plaintext token is embedded in a time-limited link and delivered via Resend transactional email
5. Token expiry: **1 hour** from generation
6. Tokens are **single-use** — invalidated immediately upon consumption, even if the user does not complete the flow

---

## 2. Authorization Model

### Role Hierarchy

The system defines seven roles with numeric privilege levels:

| Role | Level | Scope |
|---|---|---|
| `owner` | 5 | Full platform access, all services |
| `head_office` | 4 | All services, most platform features |
| `admin` | 4 | All services, operational features |
| `marketing` | 3 | Read-broad, write on marketing modules |
| `coordinator` | 2 | Assigned service(s), operational features |
| `member` | 2 | Own service, limited feature set |
| `staff` | 1 | My Portal, own records only |

### Middleware-Level Page Protection

Route access is enforced in `middleware.ts`, which runs at the **Edge runtime** before any page or API handler executes. This means unauthenticated and unauthorized requests are rejected before touching the database or application server. Middleware checks both session validity and minimum role level for each protected route group.

### Feature-Level Permissions

Beyond page access, 83 discrete capabilities are declared in `role-permissions.ts`. Each permission is checked at the component and API level independently of route-level middleware. This two-layer model ensures that a user who gains access to a page through an unexpected path cannot perform actions their role does not permit.

Examples of granular capabilities:

- `canManageUsers` — create, edit, and deactivate staff accounts
- `canViewFinancials` — access revenue, cost, and margin reports
- `canManageApiKeys` — create and revoke API keys
- `canManageXeroIntegration` — configure Xero OAuth connection
- `canViewChildProtectionRecords` — access child-related compliance records
- `canExportData` — trigger bulk data exports

### API Route Protection

Three protection patterns are used depending on the caller type:

| Pattern | Use case |
|---|---|
| `requireAuth()` | Internal dashboard API routes — validates JWT session and attaches user context |
| `withApiAuth()` | Routes that accept both session and API key authentication |
| `authenticateApiKey(req, scope)` | External/integration endpoints — validates hashed API key and checks the required scope |

### Service and State Scoping

- `getServiceScope()` — coordinators, members, and staff are automatically scoped to their assigned service. Queries outside that service return 404 or empty results rather than authorization errors, preventing enumeration.
- `getStateScope()` — state-level managers see only services within their state. Applied before any cross-service aggregation query.

---

## 3. Data Access Patterns per Role

### Owner (Level 5)

Full read/write access to all data across all services, states, and organization settings. Exclusive access to: user import, Xero integration configuration, API key management, organization-wide settings, and billing information.

### Head Office (Level 4 — `head_office`)

Equivalent to owner across all operational and reporting features. Cannot access: organization settings, user import tooling, Xero configuration, or API key management.

### Admin (Level 4 — `admin`)

Equivalent to `head_office` for day-to-day operations across all services. Cannot access: CRM email template management or platform settings.

### Marketing (Level 3)

Read access across most reporting and operational views for content and campaign purposes. Write access scoped to: marketing campaigns, communication records, and parent engagement modules. Cannot access: staff records, financial data, compliance records, or settings.

### Coordinator (Level 2)

Full operational access within their assigned service(s): rosters, compliance, leave management, staff communications, enrolment enquiries, and incident records. Cannot access: cross-service data, financial margins, or organization-level settings.

### Member (Level 2)

Access to their own service's operational data and their own staff portal. Visibility is comparable to coordinator but limited to a single service context.

### Staff (Level 1)

Access restricted to My Portal only:
- Own documents and certificates
- Own onboarding tasks
- Own leave requests and leave balance
- Own compliance records (qualifications, WWC, first aid)
- Own to-do items
- Communication sent to them
- Assigned shift information

Staff cannot access any other staff member's records, financial data, child records, or operational management tools.

---

## 4. Sensitive Data Handling

### Child Information

Child personal information (names, ages, medical conditions, dietary requirements) is stored in `ParentEnquiry.childrenData` as a structured JSON field. Access to records containing child data is restricted to roles admin and above. Child data is never included in API responses to `staff` or `member` roles.

### Staff Records

Personal details, visa and work rights status, bank account details, and superannuation information are stored server-side only. These fields are:

- Never included in client-side rendered page props unless the authenticated user is the record owner or has `canViewStaffPersonalDetails` permission
- Excluded from all list-view API responses — only returned when a specific staff member is requested with appropriate authorization
- Audit-logged on access for visa/bank/super fields

### Financial Data

Revenue, cost, occupancy margins, and fee schedule data are gated behind the `canViewFinancials` capability, which is only granted to `owner`, `head_office`, and `admin` roles. Financial endpoints reject all other roles with HTTP 403 before executing any database query.

### API Keys

- At creation, the full plaintext key is returned **once** and never stored
- The stored value is a **SHA-256 hash** of the key
- A short prefix (e.g., `amana_live_xxxx`) is stored separately for display in the settings UI
- API key scopes are stored alongside the hash, and `authenticateApiKey()` validates both the hash and the required scope for each endpoint

### File Uploads

- Storage: Vercel Blob with private access URLs (not publicly guessable)
- Maximum file size: 10 MB per upload
- Allowed extensions: enforced via an allowlist at the API layer before the file is written to storage
- Filenames are sanitized (path traversal characters stripped, length capped) before storage
- Blob URLs are generated server-side and delivered to the client only after authorization is confirmed

---

## 5. Third-Party Integrations

All third-party credentials are environment variables accessible only in server-side contexts (`NEXT_PUBLIC_` prefix is not used for any secret). They are never embedded in client bundles.

| Integration | Purpose | Credentials |
|---|---|---|
| **Resend** | Transactional email (password reset, digests, alerts) | `RESEND_API_KEY` |
| **Brevo** | Marketing email campaigns | `BREVO_API_KEY` |
| **Anthropic** | AI assistant for operational queries | `ANTHROPIC_API_KEY` — per-user daily token limits enforced server-side |
| **Xero** | Financial sync via OAuth 2.0 | `XERO_CLIENT_SECRET`, `XERO_ENCRYPTION_KEY` — refresh tokens are AES-encrypted at rest |
| **Azure AD** | SSO for staff using organization Microsoft accounts | `AZURE_AD_CLIENT_SECRET` |
| **WhatsApp / Meta** | Parent communication via WhatsApp Business API | `WHATSAPP_ACCESS_TOKEN`, `META_APP_SECRET` — webhook payloads verified with HMAC-SHA256 |
| **Upstash Redis** | Rate limiting and short-lived caching | `UPSTASH_REDIS_REST_TOKEN` |
| **Vercel Blob** | Private file storage | `BLOB_READ_WRITE_TOKEN` |

All secrets are rotated on suspected compromise and reviewed quarterly. No secret is committed to version control — `.env` files are git-ignored and secrets are injected at deployment time via Vercel environment variables.

---

## 6. Security Controls

### HTTP Security Headers

The following headers are set on all responses:

| Header | Value |
|---|---|
| `Content-Security-Policy` | Restrictive policy; inline scripts require nonces |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` (2 years) |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |

### Rate Limiting

| Endpoint | Limit |
|---|---|
| Login | 5 attempts / 15 min / email |
| Password reset request | 3 requests / 15 min / email |
| API key endpoints | Per-key limits configured at creation (Cowork pattern: `checkApiKeyRateLimit`) |
| AI assistant | Per-user daily token quota |

### Cron Job Security

Cron job routes are protected by a `CRON_SECRET` bearer token, verified via the `verifyCronSecret()` helper before any job logic runs. Idempotency is enforced via `acquireCronLock()` which sets a Redis lock for the duration of each job run, preventing duplicate execution if Vercel retries a cron invocation.

### Environment Validation

On application startup, required environment variables are validated. Missing critical variables (database URL, NextAuth secret, encryption keys) cause the process to fail immediately with a clear error rather than starting in a degraded or insecure state.

### Error Monitoring

**Sentry** is configured across server, edge, and client runtimes with source maps uploaded at build time. Sensitive fields (passwords, tokens, API keys) are scrubbed from Sentry payloads via a `beforeSend` filter. Sentry alerts on error rate spikes and unhandled exceptions feed into the incident detection workflow below.

---

## 7. Incident Response Procedure

### Step 1 — Identify

Detection sources, in priority order:

1. Sentry error alerts (configured threshold-based notifications)
2. Vercel health check failures or deployment anomalies
3. User reports via support channels
4. Anomalous access patterns visible in activity logs or Upstash rate-limit spikes

### Step 2 — Contain

Actions taken immediately upon confirmed incident, proportional to severity:

- Revoke compromised API keys from the settings panel (takes effect immediately — hash mismatch on next request)
- Disable affected user accounts (blocks JWT acceptance at the `requireAuth()` layer)
- Rotate compromised environment secrets via Vercel dashboard and trigger a redeployment
- If database credentials are suspected compromised: rotate via Railway/PostgreSQL provider and redeploy
- If Xero OAuth tokens are compromised: revoke via Xero developer portal and re-authorize

### Step 3 — Investigate

Evidence sources:

- **Sentry**: stack traces, request context, user identity at time of error
- **Vercel logs**: raw request/response logs, edge middleware logs
- **Application activity log**: user action audit trail stored in the database (`ActivityLog` model)
- **Database**: direct query for anomalous records (unexpected creates, deletes, or bulk reads)
- **Upstash**: rate limit hit counts per key to identify brute-force patterns

### Step 4 — Remediate

1. Identify root cause (vulnerability class, misconfiguration, or credential compromise)
2. Implement fix in a feature branch with a targeted test
3. Deploy via standard CI/CD pipeline (Vercel preview → production promotion)
4. Verify fix in production with a controlled reproduction attempt
5. Confirm Sentry error rate returns to baseline

### Step 5 — Post-Mortem

Within 5 business days of resolution:

- Document: timeline, root cause, impact scope, affected records or users
- Update: runbooks, security controls, or code patterns as appropriate
- Notify stakeholders: if personal information of children, families, or staff was accessed or disclosed without authorization, follow the Australian Notifiable Data Breaches scheme (Privacy Act s26WK) — notify the OAIC and affected individuals within 30 days of awareness
- Notify regulatory bodies as required: ACECQA, state/territory regulatory authority, or relevant state privacy commissioner

---

## Appendix — Key Files

| File | Purpose |
|---|---|
| `src/lib/auth.ts` | NextAuth configuration, JWT callbacks, session shape |
| `src/middleware.ts` | Edge-runtime route protection and role checks |
| `src/lib/role-permissions.ts` | 83-capability permission matrix per role |
| `src/lib/api-key-auth.ts` | API key hashing, scope validation, rate limiting |
| `src/lib/prisma.ts` | Prisma client singleton (connection pooling) |
| `src/lib/email-templates.ts` | Transactional email HTML (password reset, alerts) |
| `prisma/schema.prisma` | Database schema including audit and token models |
| `vercel.json` | Cron schedule definitions |
| `next.config.ts` | Security headers configuration |

---

*This document is maintained by the Amana OSHC technology team. It should be reviewed following any significant architecture change, security incident, or at minimum annually.*
