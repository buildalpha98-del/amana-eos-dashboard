# Parent Portal v2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the 8-page Parent Portal in place with a "Soft & Human" UI on Amana brand colours, rebuild 4 high-traffic flows (Home / Child Detail / Bookings / Messages), add end-to-end likes + comments on staff parent-posts, and ship everything behind a flag that rolls out page-by-page.

**Architecture:** Extend existing `src/app/globals.css` with new tokens + utility. New parent-scoped primitives under `src/components/parent/ui/`. Each redesigned page uses a `page.tsx` switcher that picks `<HomeV1 />` or `<HomeV2 />` based on a build-time flag (`NEXT_PUBLIC_PARENT_PORTAL_V2`) plus `?v2=1/0` query override. Two new additive Prisma models (`ParentPostLike`, `ParentPostComment`) and six new API routes for engagement. Shared helpers (`canParentAccessPost`, `resolveParentContactForService`) keep auth/visibility logic in one place.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Tailwind v4 / Prisma 5.22 / Vitest 4 / Playwright / `vaul` (new dep, ~2kb — bottom-sheet with snap points).

**Spec:** `docs/superpowers/specs/2026-04-23-parent-portal-v2-design.md`

---

## Repo conventions (follow, don't rediscover)

- All parent page files start with `"use client"` — they're client components.
- New parent components live under `src/components/parent/ui/` (not `src/components/ui/` — that's shared with staff dashboard).
- Tests live at `src/__tests__/` with subfolders `lib/` (utility/helpers), `api/` (route tests), `e2e/` (Playwright).
- Test helpers are in `src/__tests__/helpers/` — especially `prisma-mock.ts` and `request.ts`.
- Route tests use `mockImplementation` with input-based routing (never `mockResolvedValueOnce` chains).
- Toast calls require `description`: `toast({ description: "…" })` — not optional.
- All mutations must have `onError: (err) => toast({ variant: "destructive", description: err.message })`.
- All queries need `retry: 2` and `staleTime`.
- All routes write-endpoints must be Zod-validated.
- Parent routes wrap with `withParentAuth` from `@/lib/parent-auth`.
- Staff dashboard routes wrap with `withApiAuth` from `@/lib/server-auth`.
- Existing session-aware rate limiting is already baked into `withParentAuth` (60/min per parent per endpoint) and `withApiAuth` (60/min per user per endpoint).

---

## Chunk 1: Design tokens + 8 primitives + unit tests (commits 1–2)

This is the foundation. Nothing user-visible ships from this chunk — all new code lives under `src/components/parent/ui/` and in a few new entries inside existing `globals.css`. No page imports the primitives yet.

### Task 1.1: Add `vaul` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install vaul**

Run: `npm install vaul@^1`
Expected: `package.json` gets new entry under `dependencies`, `package-lock.json` updates.

- [ ] **Step 2: Verify install**

Run: `npm ls vaul`
Expected: `vaul@1.x.x` printed, no "missing" errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(parent): add vaul for PullSheet snap-point bottom sheet"
```

### Task 1.2: Extend design tokens in `globals.css`

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add new tokens inside `@theme inline` block**

Locate the existing `@theme inline { … }` at the top of `globals.css`. Append these lines inside it, after the existing `--shadow-warm-*` lines:

```css
  /* ─── Parent Portal v2 additions ────────────────────────── */

  /* Radius scale — parent cards default to rounded-lg (20px) */
  --radius-xs: 6px;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-xl: 28px;

  /* Soft cream surfaces */
  --color-cream-deep: #F5EFE7;
  --color-cream-soft: #FFFDF9;
  --color-brand-soft: rgba(0, 78, 100, 0.06);

  /* Warm status palette */
  --color-status-in-care-bg: #D4F4D4;
  --color-status-in-care-fg: #1F5E1F;
  --color-status-confirmed-bg: #E6F3F7;
  --color-status-confirmed-fg: #004E64;
  --color-status-pending-bg: #FFE9D6;
  --color-status-pending-fg: #8B4513;
  --color-status-alert-bg: #FFE4E4;
  --color-status-alert-fg: #8B2525;

  /* Overshoot easing for tap affordances */
  --ease-spring-gentle: cubic-bezier(0.34, 1.56, 0.64, 1);
```

- [ ] **Step 2: Add dark-mode overrides**

Locate the `.dark { … }` block. Append inside it (before the closing `}`):

```css
  --color-cream-deep: #1e1e28;
  --color-cream-soft: #242430;
  --color-brand-soft: rgba(254, 206, 0, 0.08);
  --color-status-in-care-bg: #1e3a1e;
  --color-status-in-care-fg: #9FD49F;
  --color-status-confirmed-bg: #1c3440;
  --color-status-confirmed-fg: #9CC5D3;
  --color-status-pending-bg: #3a2a18;
  --color-status-pending-fg: #E0B68A;
  --color-status-alert-bg: #3a1e1e;
  --color-status-alert-fg: #E09A9A;
```

- [ ] **Step 3: Add `warm-card` utility at the end of the file**

```css
/* ─── Warm card (parent portal) ─────────────────────────── */

@utility warm-card {
  background: var(--color-cream-soft);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-warm);
  padding: 1rem;
  transition: transform 0.2s var(--ease-spring-gentle), box-shadow 0.2s ease;
}
```

- [ ] **Step 4: Add parent-portal-scoped `:active` press effect + reduced-motion override**

At the end of the file:

```css
/* ─── Parent portal press affordance ────────────────────── */

.parent-portal a[role="button"]:active,
.parent-portal button:not([disabled]):active,
.parent-portal [role="button"]:active {
  transform: scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .parent-portal a[role="button"]:active,
  .parent-portal button:not([disabled]):active,
  .parent-portal [role="button"]:active {
    transform: none;
  }
}
```

- [ ] **Step 5: Verify build still compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint -- src/app/globals.css` (or skip — CSS doesn't lint, but make sure ESLint isn't mad about anything touching globals).

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(parent): add design tokens, warm-card utility, and press-scale for portal v2"
```

### Task 1.3: Apply `.parent-portal` class to layout

**Files:**
- Modify: `src/app/parent/layout.tsx`

- [ ] **Step 1: Add the class to the outermost `<div>`**

Find the outer `<div className="min-h-screen bg-[#FFFAE6]">` inside `ParentLayoutInner`. Change to:

```tsx
<div className="parent-portal min-h-screen bg-[#FFFAE6]">
```

- [ ] **Step 2: Verify tsc**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/parent/layout.tsx
git commit -m "feat(parent): scope press-scale affordance to .parent-portal"
```

### Task 1.4: Create `useV2Flag` helper

**Files:**
- Create: `src/app/parent/utils/useV2Flag.ts`
- Test: `src/__tests__/lib/useV2Flag.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/useV2Flag.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
}));

import { useSearchParams } from "next/navigation";
import { useV2Flag } from "@/app/parent/utils/useV2Flag";

describe("useV2Flag", () => {
  const OLD_ENV = process.env.NEXT_PUBLIC_PARENT_PORTAL_V2;
  beforeEach(() => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as any);
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_PARENT_PORTAL_V2 = OLD_ENV;
  });

  it("returns true when ?v2=1", () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("v2=1") as any);
    const { result } = renderHook(() => useV2Flag());
    expect(result.current).toBe(true);
  });

  it("returns false when ?v2=0, ignoring env", () => {
    process.env.NEXT_PUBLIC_PARENT_PORTAL_V2 = "true";
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("v2=0") as any);
    const { result } = renderHook(() => useV2Flag());
    expect(result.current).toBe(false);
  });

  it("falls back to env var when no query override", () => {
    process.env.NEXT_PUBLIC_PARENT_PORTAL_V2 = "true";
    const { result } = renderHook(() => useV2Flag());
    expect(result.current).toBe(true);
  });

  it("returns false when env var is not 'true'", () => {
    process.env.NEXT_PUBLIC_PARENT_PORTAL_V2 = "false";
    const { result } = renderHook(() => useV2Flag());
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail (module not found)**

Run: `npx vitest run src/__tests__/lib/useV2Flag.test.ts`
Expected: failure — `Cannot find module '@/app/parent/utils/useV2Flag'`.

- [ ] **Step 3: Implement**

```ts
// src/app/parent/utils/useV2Flag.ts
"use client";

import { useSearchParams } from "next/navigation";

/**
 * Determines whether the parent portal v2 redesign should render.
 *
 * Priority:
 *   1. `?v2=1` → always true (for staging verification in prod builds)
 *   2. `?v2=0` → always false
 *   3. `process.env.NEXT_PUBLIC_PARENT_PORTAL_V2 === "true"` → env default
 */
export function useV2Flag(): boolean {
  const override = useSearchParams().get("v2");
  if (override === "1") return true;
  if (override === "0") return false;
  return process.env.NEXT_PUBLIC_PARENT_PORTAL_V2 === "true";
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/__tests__/lib/useV2Flag.test.ts`
Expected: 4/4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/parent/utils/useV2Flag.ts src/__tests__/lib/useV2Flag.test.ts
git commit -m "feat(parent): useV2Flag helper (env + ?v2= override)"
```

### Task 1.5: Avatar primitive

**Files:**
- Create: `src/components/parent/ui/Avatar.tsx`
- Test: `src/__tests__/components/parent/Avatar.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/__tests__/components/parent/Avatar.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Avatar } from "@/components/parent/ui/Avatar";

describe("Avatar", () => {
  it("renders initial from name when no src", () => {
    const { getByText } = render(<Avatar name="Sophia Kowaider" />);
    expect(getByText("S")).toBeInTheDocument();
  });

  it("produces deterministic gradient for same seed (hydration stability)", () => {
    const { container: a } = render(<Avatar name="Sophia" seed="child-abc" />);
    const { container: b } = render(<Avatar name="Sophia" seed="child-abc" />);
    const gradA = (a.firstChild as HTMLElement).style.background;
    const gradB = (b.firstChild as HTMLElement).style.background;
    expect(gradA).toBe(gradB);
    expect(gradA).toMatch(/^linear-gradient\(135deg/);
  });

  it("produces different gradients for different seeds", () => {
    const { container: a } = render(<Avatar name="A" seed="seed-1" />);
    const { container: b } = render(<Avatar name="A" seed="seed-2000000" />);
    const gradA = (a.firstChild as HTMLElement).style.background;
    const gradB = (b.firstChild as HTMLElement).style.background;
    expect(gradA).not.toBe(gradB);
  });

  it("renders <img> when src provided", () => {
    const { getByRole } = render(<Avatar name="X" src="/p.jpg" />);
    expect(getByRole("img")).toHaveAttribute("src", "/p.jpg");
  });

  it("respects size prop", () => {
    const { container } = render(<Avatar name="X" size="lg" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("w-12");
    expect(el.className).toContain("h-12");
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx vitest run src/__tests__/components/parent/Avatar.test.tsx`

- [ ] **Step 3: Implement**

```tsx
// src/components/parent/ui/Avatar.tsx
"use client";

import { cn } from "@/lib/utils";

// ─── Deterministic hash (djb2, 32-bit signed) ───────────
// Byte-identical on server and client — safe for SSR gradient selection.
function djb2(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash = hash | 0;
  }
  return Math.abs(hash);
}

// ─── Gradient presets ──────────────────────────────────
export const AVATAR_GRADIENTS = [
  { name: "teal",  start: "#7FD3D9", end: "#4A9BA3" },
  { name: "peach", start: "#FFB48E", end: "#E08A5E" },
  { name: "amber", start: "#FFC94D", end: "#E89F1E" },
  { name: "sage",  start: "#A8C8A8", end: "#6D9A6D" },
  { name: "rose",  start: "#F4A5B5", end: "#D07089" },
  { name: "lilac", start: "#C4A8E0", end: "#8C6FB8" },
] as const;

export function gradientFor(seed: string): string {
  const preset = AVATAR_GRADIENTS[djb2(seed) % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${preset.start}, ${preset.end})`;
}

// ─── Component ─────────────────────────────────────────
const SIZE_CLASSES = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-20 h-20 text-2xl",
} as const;

interface AvatarProps {
  name: string;
  seed?: string;
  size?: keyof typeof SIZE_CLASSES;
  src?: string;
  className?: string;
}

export function Avatar({
  name,
  seed,
  size = "md",
  src,
  className,
}: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const resolvedSeed = seed ?? name;
  const background = gradientFor(resolvedSeed);

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white overflow-hidden",
        SIZE_CLASSES[size],
        className,
      )}
      style={src ? undefined : { background }}
      aria-label={`Avatar for ${name}`}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" role="img" />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `npx vitest run src/__tests__/components/parent/Avatar.test.tsx`
Expected: 5/5 pass.

- [ ] **Step 5: Commit (hold — we'll batch commit all primitives together at end of task 1.11)**

### Task 1.6: StatusBadge primitive

**Files:**
- Create: `src/components/parent/ui/StatusBadge.tsx`
- Test: `src/__tests__/components/parent/StatusBadge.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/__tests__/components/parent/StatusBadge.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StatusBadge } from "@/components/parent/ui/StatusBadge";

describe("StatusBadge", () => {
  it.each([
    ["in-care", "In care"],
    ["confirmed", "Confirmed"],
    ["requested", "Requested"],
    ["waitlisted", "Requested"], // falls back to requested label
    ["declined", "Declined"],
    ["new", "New"],
    ["overdue", "Overdue"],
  ] as const)("renders %s variant with label %s", (variant, label) => {
    const { getByText } = render(<StatusBadge variant={variant} />);
    expect(getByText(label)).toBeInTheDocument();
  });

  it("can override label", () => {
    const { getByText } = render(
      <StatusBadge variant="in-care" label="Signed in" />,
    );
    expect(getByText("Signed in")).toBeInTheDocument();
  });

  it("has role=status for aria", () => {
    const { getByRole } = render(<StatusBadge variant="in-care" />);
    expect(getByRole("status")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement**

```tsx
// src/components/parent/ui/StatusBadge.tsx
"use client";

import { cn } from "@/lib/utils";

export type StatusVariant =
  | "in-care"
  | "confirmed"
  | "requested"
  | "waitlisted"
  | "declined"
  | "new"
  | "overdue";

const VARIANT_STYLES: Record<StatusVariant, { bg: string; fg: string; label: string }> = {
  "in-care":   { bg: "var(--color-status-in-care-bg)",   fg: "var(--color-status-in-care-fg)",   label: "In care" },
  "confirmed": { bg: "var(--color-status-confirmed-bg)", fg: "var(--color-status-confirmed-fg)", label: "Confirmed" },
  "requested": { bg: "var(--color-status-pending-bg)",   fg: "var(--color-status-pending-fg)",   label: "Requested" },
  "waitlisted":{ bg: "var(--color-status-pending-bg)",   fg: "var(--color-status-pending-fg)",   label: "Requested" },
  "declined":  { bg: "var(--color-status-alert-bg)",     fg: "var(--color-status-alert-fg)",     label: "Declined" },
  "new":       { bg: "var(--color-status-confirmed-bg)", fg: "var(--color-status-confirmed-fg)", label: "New" },
  "overdue":   { bg: "var(--color-status-alert-bg)",     fg: "var(--color-status-alert-fg)",     label: "Overdue" },
};

interface StatusBadgeProps {
  variant: StatusVariant;
  label?: string;
  className?: string;
}

export function StatusBadge({ variant, label, className }: StatusBadgeProps) {
  const style = VARIANT_STYLES[variant];
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        className,
      )}
      style={{ background: style.bg, color: style.fg }}
    >
      {label ?? style.label}
    </span>
  );
}
```

- [ ] **Step 4: Run tests — expect pass**

### Task 1.7: SectionLabel primitive

**Files:**
- Create: `src/components/parent/ui/SectionLabel.tsx`
- Test: `src/__tests__/components/parent/SectionLabel.test.tsx`

- [ ] **Step 1: Write test**

```tsx
// src/__tests__/components/parent/SectionLabel.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SectionLabel } from "@/components/parent/ui/SectionLabel";

describe("SectionLabel", () => {
  it("renders the label", () => {
    const { getByText } = render(<SectionLabel label="Children" />);
    expect(getByText("Children")).toBeInTheDocument();
  });

  it("renders action link when provided", () => {
    const { getByRole } = render(
      <SectionLabel label="Children" action={{ href: "/parent/children", text: "View all" }} />,
    );
    const link = getByRole("link", { name: "View all" });
    expect(link).toHaveAttribute("href", "/parent/children");
  });

  it("omits action when not provided", () => {
    const { queryByRole } = render(<SectionLabel label="Children" />);
    expect(queryByRole("link")).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/components/parent/ui/SectionLabel.tsx
"use client";

import Link from "next/link";

interface SectionLabelProps {
  label: string;
  action?: { href: string; text: string };
}

export function SectionLabel({ label, action }: SectionLabelProps) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-[11px] font-heading font-semibold text-[color:var(--color-muted)] uppercase tracking-[0.08em]">
        {label}
      </h2>
      {action && (
        <Link
          href={action.href}
          className="text-xs font-medium text-[color:var(--color-brand)] hover:text-[color:var(--color-brand-light)] min-h-[44px] flex items-center"
        >
          {action.text}
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run tests, expect pass**

### Task 1.8: KidPill primitive

**Files:**
- Create: `src/components/parent/ui/KidPill.tsx`
- Test: `src/__tests__/components/parent/KidPill.test.tsx`

- [ ] **Step 1: Write test**

```tsx
// src/__tests__/components/parent/KidPill.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { KidPill } from "@/components/parent/ui/KidPill";

describe("KidPill", () => {
  const child = { id: "c1", name: "Sophia", subtitle: "Year 2 · Fitzroy North" };

  it("renders name and subtitle", () => {
    const { getByText } = render(<KidPill child={child} />);
    expect(getByText("Sophia")).toBeInTheDocument();
    expect(getByText(/Year 2 · Fitzroy North/)).toBeInTheDocument();
  });

  it("renders as link when href provided", () => {
    const { getByRole } = render(<KidPill child={child} href="/parent/children/c1" />);
    expect(getByRole("link")).toHaveAttribute("href", "/parent/children/c1");
  });

  it("renders status badge when status provided", () => {
    const { getByRole } = render(<KidPill child={child} status="in-care" />);
    expect(getByRole("status")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/components/parent/ui/KidPill.tsx
"use client";

import Link from "next/link";
import { Avatar } from "./Avatar";
import { StatusBadge, type StatusVariant } from "./StatusBadge";
import { cn } from "@/lib/utils";

interface KidPillProps {
  child: { id: string; name: string; subtitle?: string };
  status?: StatusVariant;
  href?: string;
  onPress?: () => void;
  className?: string;
}

export function KidPill({ child, status, href, onPress, className }: KidPillProps) {
  const content = (
    <div
      className={cn(
        "warm-card flex items-center gap-3",
        className,
      )}
    >
      <Avatar name={child.name} seed={child.id} size="lg" />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-[color:var(--color-foreground)] truncate">
          {child.name}
        </div>
        {child.subtitle && (
          <div className="text-xs text-[color:var(--color-muted)] truncate mt-0.5">
            {child.subtitle}
          </div>
        )}
      </div>
      {status && <StatusBadge variant={status} />}
    </div>
  );

  if (href) return <Link href={href} className="block">{content}</Link>;
  if (onPress)
    return (
      <button type="button" onClick={onPress} className="block w-full text-left">
        {content}
      </button>
    );
  return content;
}
```

- [ ] **Step 3: Run tests, expect pass**

### Task 1.9: SessionCard primitive

**Files:**
- Create: `src/components/parent/ui/SessionCard.tsx`
- Test: `src/__tests__/components/parent/SessionCard.test.tsx`

- [ ] **Step 1: Write test**

```tsx
// src/__tests__/components/parent/SessionCard.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SessionCard } from "@/components/parent/ui/SessionCard";

describe("SessionCard", () => {
  const date = new Date("2026-04-24");

  it("renders day, date, label, sublabel", () => {
    const { getByText } = render(
      <SessionCard
        date={date}
        label="Sophia — ASC"
        sublabel="3:15pm pickup · Fitzroy North"
        status="confirmed"
      />,
    );
    expect(getByText("FRI")).toBeInTheDocument();
    expect(getByText("24")).toBeInTheDocument();
    expect(getByText("Sophia — ASC")).toBeInTheDocument();
    expect(getByText(/Fitzroy North/)).toBeInTheDocument();
  });

  it("shows status badge", () => {
    const { getByRole } = render(
      <SessionCard date={date} label="x" status="confirmed" />,
    );
    expect(getByRole("status")).toBeInTheDocument();
  });

  it("supports tile variant for horizontal scrolls", () => {
    const { container } = render(
      <SessionCard date={date} label="x" status="confirmed" variant="tile" />,
    );
    expect(container.firstChild).toHaveClass("min-w-[128px]");
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/components/parent/ui/SessionCard.tsx
"use client";

import { StatusBadge, type StatusVariant } from "./StatusBadge";
import { cn } from "@/lib/utils";

interface SessionCardProps {
  date: Date;
  label: string;
  sublabel?: string;
  status: StatusVariant;
  variant?: "list" | "tile";
  className?: string;
}

export function SessionCard({
  date,
  label,
  sublabel,
  status,
  variant = "list",
  className,
}: SessionCardProps) {
  const dayName = date.toLocaleDateString("en-AU", { weekday: "short" }).toUpperCase();
  const dayNum = date.getDate();

  if (variant === "tile") {
    return (
      <div className={cn("warm-card min-w-[128px] flex flex-col gap-2", className)}>
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-bold tracking-wider text-[color:var(--color-brand)]">
            {dayName}
          </span>
          <span className="text-xl font-bold text-[color:var(--color-brand)] leading-none">
            {dayNum}
          </span>
        </div>
        <div className="text-xs font-semibold text-[color:var(--color-foreground)] truncate">
          {label}
        </div>
        {sublabel && (
          <div className="text-[10px] text-[color:var(--color-muted)] truncate">{sublabel}</div>
        )}
        <StatusBadge variant={status} />
      </div>
    );
  }

  return (
    <div className={cn("warm-card flex items-center gap-3", className)}>
      <div className="w-11 h-11 rounded-[var(--radius-sm)] bg-[color:var(--color-brand-soft)] flex flex-col items-center justify-center shrink-0">
        <span className="text-[9px] font-bold tracking-wider text-[color:var(--color-brand)]">
          {dayName}
        </span>
        <span className="text-sm font-bold text-[color:var(--color-brand)] leading-none">
          {dayNum}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[color:var(--color-foreground)] truncate">
          {label}
        </div>
        {sublabel && (
          <div className="text-xs text-[color:var(--color-muted)] truncate mt-0.5">
            {sublabel}
          </div>
        )}
      </div>
      <StatusBadge variant={status} />
    </div>
  );
}
```

- [ ] **Step 3: Run tests, expect pass**

### Task 1.10: WarmCTA primitive

**Files:**
- Create: `src/components/parent/ui/WarmCTA.tsx`
- Test: `src/__tests__/components/parent/WarmCTA.test.tsx`

- [ ] **Step 1: Write test**

```tsx
// src/__tests__/components/parent/WarmCTA.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { WarmCTA } from "@/components/parent/ui/WarmCTA";
import { Plus } from "lucide-react";

describe("WarmCTA", () => {
  it("renders title, sub, icon inside a link", () => {
    const { getByRole, getByText } = render(
      <WarmCTA icon={Plus} title="Book a casual" sub="Same day bookings" href="/parent/bookings" />,
    );
    const link = getByRole("link");
    expect(link).toHaveAttribute("href", "/parent/bookings");
    expect(getByText("Book a casual")).toBeInTheDocument();
    expect(getByText("Same day bookings")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/components/parent/ui/WarmCTA.tsx
"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface WarmCTAProps {
  icon: LucideIcon;
  title: string;
  sub?: string;
  href: string;
  tone?: "brand" | "accent";
  className?: string;
}

export function WarmCTA({
  icon: Icon,
  title,
  sub,
  href,
  tone = "brand",
  className,
}: WarmCTAProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-lg)] p-4 border transition-all",
        tone === "brand"
          ? "bg-gradient-to-r from-[color:var(--color-brand-soft)] to-[color:var(--color-accent)]/10 border-[color:var(--color-brand)]/15"
          : "bg-gradient-to-r from-[color:var(--color-accent)]/10 to-[color:var(--color-accent)]/30 border-[color:var(--color-accent)]/30",
        className,
      )}
    >
      <div className="w-10 h-10 rounded-full bg-[color:var(--color-brand-soft)] flex items-center justify-center shrink-0 text-[color:var(--color-brand)]">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[color:var(--color-foreground)] truncate">
          {title}
        </div>
        {sub && (
          <div className="text-xs text-[color:var(--color-muted)] truncate mt-0.5">{sub}</div>
        )}
      </div>
      <ChevronRight className="w-5 h-5 text-[color:var(--color-muted)] shrink-0" />
    </Link>
  );
}
```

- [ ] **Step 3: Run tests, expect pass**

### Task 1.11: PullSheet primitive (uses `vaul`)

**Files:**
- Create: `src/components/parent/ui/PullSheet.tsx`
- Test: `src/__tests__/components/parent/PullSheet.test.tsx`

- [ ] **Step 1: Write test**

`vaul` renders a portaled drawer — we only smoke-test that the component compiles and exposes a known surface. Heavy interaction testing is `vaul`'s job.

```tsx
// src/__tests__/components/parent/PullSheet.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { PullSheet } from "@/components/parent/ui/PullSheet";

describe("PullSheet", () => {
  it("renders children when open", () => {
    const { getByText } = render(
      <PullSheet open onOpenChange={vi.fn()}>
        <div>hello</div>
      </PullSheet>,
    );
    expect(getByText("hello")).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    const { queryByText } = render(
      <PullSheet open={false} onOpenChange={vi.fn()}>
        <div>hello</div>
      </PullSheet>,
    );
    expect(queryByText("hello")).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/components/parent/ui/PullSheet.tsx
"use client";

import { Drawer } from "vaul";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const SNAP_POINTS = [0.2, 0.6, 0.95] as const;

interface PullSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapPoints?: readonly (number | string)[];
  activeSnapPoint?: number | string | null;
  onActiveSnapPointChange?: (snap: number | string | null) => void;
  children: ReactNode;
  className?: string;
}

export function PullSheet({
  open,
  onOpenChange,
  snapPoints = SNAP_POINTS,
  activeSnapPoint,
  onActiveSnapPointChange,
  children,
  className,
}: PullSheetProps) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      snapPoints={[...snapPoints]}
      activeSnapPoint={activeSnapPoint ?? snapPoints[1]}
      setActiveSnapPoint={onActiveSnapPointChange}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/30 z-40" />
        <Drawer.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex flex-col bg-[color:var(--color-cream-soft)] rounded-t-[var(--radius-xl)] border-t border-[color:var(--color-border)] shadow-[var(--shadow-warm-lg)]",
            "focus:outline-none",
            className,
          )}
          style={{ maxHeight: "95dvh" }}
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-[color:var(--color-border)] shrink-0" aria-hidden="true" />
          <div className="overflow-y-auto flex-1 px-4 pb-6 pt-4">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

- [ ] **Step 3: Run tests, expect pass** (may need `@testing-library/jest-dom` already configured — it is in this project).

### Task 1.12: SwipeActions primitive

**Files:**
- Create: `src/components/parent/ui/SwipeActions.tsx`
- Test: `src/__tests__/components/parent/SwipeActions.test.tsx`

- [ ] **Step 1: Write test**

```tsx
// src/__tests__/components/parent/SwipeActions.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SwipeActions } from "@/components/parent/ui/SwipeActions";

describe("SwipeActions", () => {
  it("renders children", () => {
    const { getByText } = render(
      <SwipeActions actions={[{ label: "Cancel", onPress: () => {} }]}>
        <div>item</div>
      </SwipeActions>,
    );
    expect(getByText("item")).toBeInTheDocument();
  });

  it("reveals action buttons on left-swipe", () => {
    const onPress = vi.fn();
    const { container, getByText } = render(
      <SwipeActions actions={[{ label: "Cancel", onPress }]}>
        <div>item</div>
      </SwipeActions>,
    );
    const row = container.firstChild as HTMLElement;
    fireEvent.pointerDown(row, { clientX: 300, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(row, { clientX: 200, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(row, { clientX: 200, clientY: 0, pointerId: 1 });
    fireEvent.click(getByText("Cancel"));
    expect(onPress).toHaveBeenCalled();
  });

  it("snaps back on small drag", () => {
    const { container } = render(
      <SwipeActions actions={[{ label: "Cancel", onPress: () => {} }]}>
        <div>item</div>
      </SwipeActions>,
    );
    const row = container.firstChild as HTMLElement;
    fireEvent.pointerDown(row, { clientX: 300, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(row, { clientX: 295, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(row, { clientX: 295, clientY: 0, pointerId: 1 });
    // After release, actions panel should not be at full reveal
    const inner = row.firstChild as HTMLElement;
    expect(inner.style.transform).not.toMatch(/-\d{2,}px/);
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/components/parent/ui/SwipeActions.tsx
"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Action {
  label: string;
  tone?: "neutral" | "danger";
  onPress: () => void;
}

interface SwipeActionsProps {
  children: ReactNode;
  actions: Action[];
  /** Pixels of reveal per action. Default 80. */
  actionWidth?: number;
  className?: string;
}

const SNAP_THRESHOLD = 0.4; // >= 40% of full reveal snaps open, else snaps closed

export function SwipeActions({
  children,
  actions,
  actionWidth = 80,
  className,
}: SwipeActionsProps) {
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);
  const activeOffset = useRef(0);
  const fullReveal = actionWidth * actions.length;

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    activeOffset.current = offset;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    const next = Math.min(0, Math.max(-fullReveal, activeOffset.current + dx));
    setOffset(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    startX.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setOffset((curr) => (Math.abs(curr) > fullReveal * SNAP_THRESHOLD ? -fullReveal : 0));
  };

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="flex transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${offset}px)` }}
      >
        <div className="w-full shrink-0">{children}</div>
      </div>
      <div
        className="absolute right-0 top-0 bottom-0 flex"
        style={{ width: `${fullReveal}px`, transform: `translateX(${fullReveal + offset}px)` }}
        aria-hidden={offset === 0}
      >
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => {
              a.onPress();
              setOffset(0);
            }}
            className={cn(
              "flex items-center justify-center text-xs font-semibold text-white px-2",
              a.tone === "danger" ? "bg-[color:var(--color-danger)]" : "bg-[color:var(--color-muted)]",
            )}
            style={{ width: `${actionWidth}px` }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests, expect pass**

### Task 1.13: Barrel + final commit of all primitives

**Files:**
- Create: `src/components/parent/ui/index.ts`

- [ ] **Step 1: Create barrel**

```ts
// src/components/parent/ui/index.ts
export { Avatar, AVATAR_GRADIENTS, gradientFor } from "./Avatar";
export { KidPill } from "./KidPill";
export { SessionCard } from "./SessionCard";
export { StatusBadge, type StatusVariant } from "./StatusBadge";
export { SectionLabel } from "./SectionLabel";
export { WarmCTA } from "./WarmCTA";
export { PullSheet, SNAP_POINTS } from "./PullSheet";
export { SwipeActions } from "./SwipeActions";
```

- [ ] **Step 2: Run full vitest suite**

Run: `npm test -- --run src/__tests__/components/parent src/__tests__/lib/useV2Flag.test.ts`
Expected: all pass.

- [ ] **Step 3: Run full build**

Run: `npm run build`
Expected: pass.

- [ ] **Step 4: Commit primitives + tests together**

```bash
git add src/components/parent/ui src/__tests__/components/parent \
        src/__tests__/lib/useV2Flag.test.ts src/app/parent/utils
git commit -m "feat(parent): 8 portal v2 primitives (Avatar, KidPill, SessionCard, StatusBadge, SectionLabel, WarmCTA, PullSheet, SwipeActions) + useV2Flag

Primitives live under src/components/parent/ui/, scoped to parent portal.
Avatar uses djb2 for SSR-stable gradient selection.
PullSheet wraps vaul with [0.2, 0.6, 0.95] snap points.
SwipeActions is a pointer-events-based left-swipe reveal primitive.
All primitives have unit tests including hydration stability for Avatar."
```

---

## Chunk 2: Likes/Comments backend (commits 3–4)

### Task 2.1: Add ParentPostLike + ParentPostComment models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add new models**

Append at the end of the `// ── Parent Posts` section (after the existing `ParentPostChildTag` model):

```prisma
model ParentPostLike {
  id         String        @id @default(cuid())
  postId     String
  post       ParentPost    @relation(fields: [postId], references: [id], onDelete: Cascade)
  likerId    String
  liker      CentreContact @relation("ParentPostLikes", fields: [likerId], references: [id], onDelete: Cascade)
  createdAt  DateTime      @default(now())

  @@unique([postId, likerId])
  @@index([postId])
  @@index([likerId])
}

model ParentPostComment {
  id               String         @id @default(cuid())
  postId           String
  post             ParentPost     @relation(fields: [postId], references: [id], onDelete: Cascade)
  parentAuthorId   String?
  parentAuthor     CentreContact? @relation("ParentPostComments", fields: [parentAuthorId], references: [id], onDelete: SetNull)
  staffAuthorId    String?
  staffAuthor      User?          @relation("ParentPostStaffComments", fields: [staffAuthorId], references: [id], onDelete: SetNull)
  body             String         @db.Text
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  @@index([postId, createdAt])
  @@index([parentAuthorId])
  @@index([staffAuthorId])
}
```

- [ ] **Step 2: Add back-relations**

In the `ParentPost` model, add:
```prisma
  likes    ParentPostLike[]
  comments ParentPostComment[]
```

In the `CentreContact` model, add:
```prisma
  parentPostLikes    ParentPostLike[]    @relation("ParentPostLikes")
  parentPostComments ParentPostComment[] @relation("ParentPostComments")
```

In the `User` model, add:
```prisma
  parentPostStaffComments ParentPostComment[] @relation("ParentPostStaffComments")
```

- [ ] **Step 3: Create migration**

Run: `npx prisma migrate dev --name add_parent_post_likes_and_comments`
Expected: migration created, schema applied, client regenerated.

- [ ] **Step 4: Verify tsc still compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): ParentPostLike + ParentPostComment models + migration"
```

### Task 2.2: Shared helpers (canParentAccessPost + resolveParentContactForService)

**Files:**
- Create: `src/lib/parent-post-visibility.ts`
- Create: `src/lib/parent-contact.ts`
- Test: `src/__tests__/lib/parent-post-visibility.test.ts`
- Test: `src/__tests__/lib/parent-contact.test.ts`

- [ ] **Step 1: Write visibility test** — covers: post not found (deny), community post in parent's service (allow), child-tagged post for parent's child (allow), post in a service the parent doesn't have access to (deny).

- [ ] **Step 2: Implement `canParentAccessPost`**

Read current timeline visibility logic from `src/app/api/parent/timeline/route.ts` and hoist into the helper. Shape:

```ts
// src/lib/parent-post-visibility.ts
import { prisma } from "@/lib/prisma";
import type { ParentJwtPayload } from "@/lib/parent-auth";
import type { ParentPost } from "@prisma/client";

export async function canParentAccessPost(
  parent: ParentJwtPayload,
  postId: string,
): Promise<{ post: ParentPost; allowed: boolean } | { post: null; allowed: false }> {
  if (parent.enrolmentIds.length === 0) {
    const post = await prisma.parentPost.findUnique({ where: { id: postId } });
    return post ? { post, allowed: false } : { post: null, allowed: false };
  }

  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
    select: { serviceId: true, childRecords: { select: { id: true } } },
  });
  const serviceIds = new Set(enrolments.map((e) => e.serviceId).filter(Boolean) as string[]);
  const childIds = new Set(enrolments.flatMap((e) => e.childRecords.map((c) => c.id)));

  const post = await prisma.parentPost.findUnique({
    where: { id: postId },
    include: { tags: { select: { childId: true } } },
  });
  if (!post) return { post: null, allowed: false };
  if (!serviceIds.has(post.serviceId)) return { post, allowed: false };
  if (post.isCommunity) return { post, allowed: true };
  const tagMatches = post.tags.some((t) => childIds.has(t.childId));
  return { post, allowed: tagMatches };
}
```

- [ ] **Step 3: Write resolveParentContactForService test + implementation**

```ts
// src/lib/parent-contact.ts
import { prisma } from "@/lib/prisma";
import type { ParentJwtPayload } from "@/lib/parent-auth";
import type { CentreContact } from "@prisma/client";

export async function resolveParentContactForService(
  parent: ParentJwtPayload,
  serviceId: string,
): Promise<CentreContact | null> {
  return prisma.centreContact.findFirst({
    where: { email: parent.email.toLowerCase(), serviceId },
  });
}
```

- [ ] **Step 4: Run tests, verify pass**

### Task 2.3: Parent-side like route (POST/DELETE)

**Files:**
- Create: `src/app/api/parent/posts/[postId]/like/route.ts`
- Test: `src/__tests__/api/parent-post-like.test.ts`

- [ ] **Step 1: Write the failing tests** — covers: unauthed (401), post not found (404), no access (403), no CentreContact for service (403), happy POST create (201 + count), idempotent POST when already liked (200 + same count), DELETE removes (200), DELETE when not liked (200 idempotent).

- [ ] **Step 2: Implement**

```ts
// src/app/api/parent/posts/[postId]/like/route.ts
import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { canParentAccessPost } from "@/lib/parent-post-visibility";
import { resolveParentContactForService } from "@/lib/parent-contact";

export const POST = withParentAuth(async (_req, { parent, params }) => {
  const { postId } = await params;
  const access = await canParentAccessPost(parent, postId);
  if (!access.post) throw ApiError.notFound("Post not found");
  if (!access.allowed) throw ApiError.forbidden("No access to this post");
  const contact = await resolveParentContactForService(parent, access.post.serviceId);
  if (!contact) throw ApiError.forbidden("No contact record for this service");

  await prisma.parentPostLike.upsert({
    where: { postId_likerId: { postId, likerId: contact.id } },
    create: { postId, likerId: contact.id },
    update: {},
  });
  const likeCount = await prisma.parentPostLike.count({ where: { postId } });
  return NextResponse.json({ liked: true, likeCount });
});

export const DELETE = withParentAuth(async (_req, { parent, params }) => {
  const { postId } = await params;
  const access = await canParentAccessPost(parent, postId);
  if (!access.post) throw ApiError.notFound("Post not found");
  if (!access.allowed) throw ApiError.forbidden("No access to this post");
  const contact = await resolveParentContactForService(parent, access.post.serviceId);
  if (!contact) throw ApiError.forbidden("No contact record for this service");

  await prisma.parentPostLike.deleteMany({ where: { postId, likerId: contact.id } });
  const likeCount = await prisma.parentPostLike.count({ where: { postId } });
  return NextResponse.json({ liked: false, likeCount });
});
```

- [ ] **Step 3: Run tests, verify pass**

### Task 2.4: Parent-side comment routes (GET list + POST create)

**Files:**
- Create: `src/app/api/parent/posts/[postId]/comments/route.ts`
- Test: `src/__tests__/api/parent-post-comments.test.ts`

- [ ] **Step 1: Write tests** — covers: unauthed, no access, empty list, paginated list, POST happy path, POST invalid (body too long / empty), POST no contact record.

- [ ] **Step 2: Implement** — pattern:
  - GET: `canParentAccessPost` → list via `prisma.parentPostComment.findMany({ where: { postId }, orderBy: { createdAt: "desc" }, take: limit + 1, cursor, include: author relations })`; transform into API shape with `authorName` = `first + last-initial`, `authorType` = `'parent' | 'staff'`.
  - POST: Zod `{ body: z.string().trim().min(1).max(2000) }`; `canParentAccessPost` + `resolveParentContactForService`; create with `parentAuthorId: contact.id`.

- [ ] **Step 3: Run tests**

### Task 2.5: Staff-side reply + delete routes

**Files:**
- Create: `src/app/api/services/[serviceId]/parent-posts/[postId]/comments/route.ts`
- Create: `src/app/api/services/[serviceId]/parent-posts/[postId]/comments/[commentId]/route.ts`
- Test: `src/__tests__/api/staff-parent-post-comments.test.ts`

- [ ] **Step 1: Tests** — covers: unauthed (401), wrong role (403), service/post mismatch (404), happy POST reply, happy DELETE, DELETE foreign comment (still ok since staff is moderator of that service's posts).

- [ ] **Step 2: Implement**
  - POST: `withApiAuth({ roles: ["owner","head_office","admin","coordinator"] })`. Validate `post.serviceId === serviceId` (404 if not). Create comment with `staffAuthorId: session.user.id`.
  - DELETE: same auth. Validate comment belongs to post belongs to service. `prisma.parentPostComment.delete({ where: { id: commentId } })`.

- [ ] **Step 3: Run tests**

### Task 2.6: Extend existing staff GET parent-posts to include counts

**Files:**
- Modify: `src/app/api/services/[id]/parent-posts/route.ts`

- [ ] **Step 1: Add `_count` to the Prisma select** — `include: { _count: { select: { likes: true, comments: true } } }`.

- [ ] **Step 2: Update response shape + existing test** to include `likeCount` / `commentCount` fields.

- [ ] **Step 3: Commit whole chunk 2**

```bash
git add prisma src/app/api/parent/posts src/app/api/services/**/comments \
        src/lib/parent-post-visibility.ts src/lib/parent-contact.ts \
        src/__tests__/lib/parent-post-visibility.test.ts \
        src/__tests__/lib/parent-contact.test.ts \
        src/__tests__/api/parent-post-like.test.ts \
        src/__tests__/api/parent-post-comments.test.ts \
        src/__tests__/api/staff-parent-post-comments.test.ts
git commit -m "feat(api): parent-post likes + comments (parent like/unlike, list/create-comment, staff reply, staff-delete, aggregate counts, shared visibility/contact helpers)"
```

---

## Chunk 3: Home v2 (commit 5)

### Task 3.1: getGreetingSubline pure function

**Files:**
- Create: `src/app/parent/utils/greeting.ts`
- Test: `src/__tests__/lib/greeting.test.ts`

- [ ] **Step 1: Write one test per branch** (9 branches per spec).

- [ ] **Step 2: Implement** — pure function matching the 9-branch rule table in spec "4a. Home".

- [ ] **Step 3: Run tests, verify pass**

### Task 3.2: Split current Home into HomeV1 + stub HomeV2

**Files:**
- Create: `src/app/parent/HomeV1.tsx` (extract body of current `src/app/parent/page.tsx`)
- Create: `src/app/parent/HomeV2.tsx` (start minimal)
- Modify: `src/app/parent/page.tsx` (switcher only)

- [ ] **Step 1: Move current body of `src/app/parent/page.tsx` into `HomeV1.tsx`**, exporting `HomeV1` as the default. Keep all existing imports.

- [ ] **Step 2: Create `HomeV2.tsx`** — initially just renders `HomeV1` for parity (we'll build it out in the next task). This lets us commit the switcher without regressions.

- [ ] **Step 3: Rewrite `page.tsx`:**

```tsx
"use client";
import { useV2Flag } from "./utils/useV2Flag";
import HomeV1 from "./HomeV1";
import HomeV2 from "./HomeV2";

export default function ParentHome() {
  const v2 = useV2Flag();
  return v2 ? <HomeV2 /> : <HomeV1 />;
}
```

- [ ] **Step 4: Run build and smoke test**

Run `npm run build`; run dev server briefly to verify parent home still renders.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(parent): split Home into V1/V2 behind NEXT_PUBLIC_PARENT_PORTAL_V2 flag"
```

### Task 3.3: Implement HomeV2

Implement per spec section "4a. Home" — greeting header, kid status strip, this-week strip, inline messages, Book-a-casual CTA, quick actions, onboarding banner, enrol-sibling CTA. All using primitives from chunk 1 and the `getGreetingSubline` helper.

(Expand steps from "write test of rendered structure" → "implement one section at a time" → "run tests + build" → "commit".)

---

## Chunk 4: Child Detail v2 (commit 6)

Split `src/app/parent/children/[id]/page.tsx` into `ChildDetailV1` + `ChildDetailV2` + switcher. Build v2 per spec section "4b. Child Detail / Attendance" (hero, 14-day strip, weekly pattern, medical, menu, sticky action bar).

## Chunk 5: Bookings v2 + fast-book (commit 7)

Split into V1/V2 + switcher. Build v2 per spec section "4c. Bookings" — segmented control, grouped list, SwipeActions on upcoming, FAB, fast-book PullSheet with 3 steps.

## Chunk 6: Messages v2 (commit 8)

Split list + thread pages into V1/V2. Build v2 per spec section "4d. Messages" — thread bubbles, composer, optimistic send via React Query.

## Chunk 7: Timeline engagement UI (commits 9–10)

### Commit 9 (parent side)
Build the redesigned `TimelineWidget` (used on Home and a new dedicated `/parent/timeline` route if needed). Add like heart + comment trigger per post. Comment thread opens in a `PullSheet`. Wire to the 4 parent-side routes from chunk 2.

### Commit 10 (staff side)
On `src/app/(dashboard)/services/[id]/parent-communication/page.tsx`, surface `likeCount` and `commentCount` badges per post. Expand post → inline comment thread + staff-reply composer (uses the staff-side comment route). Staff can delete comments.

## Chunk 8: Passive upgrades + E2E tests + cleanup (commits 11–13)

### Commit 11 — passive upgrades
Children list, Billing, Account, Getting Started — re-skin with new tokens + primitives per spec "Passive-upgrade screens".

### Commit 12 — E2E specs
Add Playwright specs per spec "Testing > E2E" — including the three cross-portal specs (`parent-portal-booking-e2e.spec.ts`, `parent-portal-post-engagement.spec.ts`, `parent-portal-messaging-e2e.spec.ts`). Playwright config gains `NEXT_PUBLIC_PARENT_PORTAL_V2=true`.

### Commit 13 — flag removal + cleanup
Once all four redesigned pages are live in prod and verified:
- Delete `HomeV1.tsx`, `ChildDetailV1.tsx`, `BookingsV1.tsx`, `MessagesV1.tsx`, `messages/[id]/ThreadV1.tsx`.
- Collapse each `page.tsx` switcher so `HomeV2` etc. become the default export (no flag read).
- Delete `src/app/parent/utils/useV2Flag.ts`.
- Remove `NEXT_PUBLIC_PARENT_PORTAL_V2` from any `.env*` files.

---

## Definition of done for the whole plan

- All spec success criteria hold (see spec §"Success criteria").
- 700+ existing tests still pass.
- New tests: ~50 unit tests across primitives + helpers + route tests, plus 7 Playwright specs.
- `npm run build` passes.
- `npm run lint` passes.
- Dev server renders both v1 and v2 via `?v2=0` / `?v2=1` override.
- No `console.log` / `console.warn` / `console.error` in production code (gated with `NODE_ENV !== "production"` if needed).

## Execution notes

- Commit 1 (`npm install vaul`) and commit 2 (`globals.css`) are trivial — do them first, they unlock the rest.
- Chunks 1 and 2 are independent of each other in code but both need to land before chunk 7. Chunks 3–6 only need chunk 1's primitives.
- If any chunk fails its reviewer loop, fix and re-run — do not skip.
- Each chunk should conclude with `npm test -- --run` and `npm run build` passing before committing.
