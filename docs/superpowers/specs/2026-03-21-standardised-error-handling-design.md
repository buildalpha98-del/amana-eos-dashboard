# Standardised Error Handling — Design Spec

## Problem

60+ API routes use ad-hoc try/catch with 3-4 different error response shapes:
- `{ error: string }` — most common
- `{ error: string, message: string }` — cowork auth
- `{ error: string, details: ... }` — some validation errors
- `{ error: ZodFlattenedError }` — financials validation

Clients can't reliably parse error responses. Error logging is inconsistent.

## Solution

### 1. `ApiError` class (`src/lib/api-error.ts`)

Throwable error with HTTP status code and optional details:

```typescript
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

Convenience factories:
- `ApiError.badRequest(message, details?)` → 400
- `ApiError.unauthorized(message?)` → 401
- `ApiError.forbidden(message?)` → 403
- `ApiError.notFound(message?)` → 404

### 2. Standardised error response shape

All API errors return:
```json
{ "error": "Human-readable message", "details": {} }
```
- `error` (string) — always present
- `details` (unknown) — optional, present for validation errors

### 3. `withApiHandler()` wrapper (`src/lib/api-handler.ts`)

Lightweight wrapper for routes that don't need session auth:

```typescript
export function withApiHandler(handler: (req: NextRequest, context?: RouteContext) => Promise<NextResponse>) {
  return async (req: NextRequest, context?: RouteContext) => {
    try {
      return await handler(req, context);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: err.message, ...(err.details ? { details: err.details } : {}) },
          { status: err.status },
        );
      }
      console.error(`API error [${req.method} ${req.nextUrl.pathname}]:`, err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
```

### 4. Update `withApiAuth()` in `server-auth.ts`

Use same `ApiError` catch logic for consistency.

### 5. Migration strategy

- Create `ApiError` class and `withApiHandler()` wrapper
- Update `withApiAuth()` to handle `ApiError`
- Migrate 5-6 representative routes as examples (services, attendance, cowork, financials)
- Remaining routes migrate incrementally in future work

### Scope exclusions

- Cron routes keep their guard system (`verifyCronSecret` + `acquireCronLock`)
- `authenticateCowork()` stays as-is (returns `NextResponse | null`)
- No changes to client-side error handling (React Query hooks)

## Files

| File | Action |
|------|--------|
| `src/lib/api-error.ts` | Create — `ApiError` class |
| `src/lib/api-handler.ts` | Create — `withApiHandler()` wrapper |
| `src/lib/server-auth.ts` | Modify — use `ApiError` in catch block |
| 5-6 route files | Modify — migrate to use wrappers + `ApiError` throws |
