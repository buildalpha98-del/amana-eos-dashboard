# UX Quick Wins — Design Spec

**Date:** 2026-03-22
**Status:** Approved
**Scope:** 5 additive-only UI improvements — no existing logic changes

## 1. Route Transition Progress Bar

**New file:** `src/components/layout/NavigationProgress.tsx`

- Thin 3px bar fixed at viewport top, `z-[60]`
- Listens to `usePathname()` — on change, animates width 0% → 80% (400ms), then 100% + fade out
- Color: `bg-accent` (#FECE00 gold)
- Rendered in dashboard `layout.tsx` above all content

## 2. Sidebar Contrast Fix

**File:** `src/components/layout/Sidebar.tsx`

- Inactive nav text: `text-white/60` → `text-white/70` (two locations: main nav + favourites)
- Meets WCAG AA 4.5:1 contrast ratio

## 3. Mobile Bottom Tab Bar

**New file:** `src/components/layout/MobileTabBar.tsx`

- 5 items: Dashboard, Todos, Services, Enquiries, More
- Fixed bottom, `md:hidden`, h-16, z-40
- Active: `text-brand`, Inactive: `text-muted`
- "More" opens sidebar drawer
- Safe area padding for notched devices

**Layout change:** Add `pb-16 md:pb-0` to content wrapper

## 4. Toast Repositioning

**File:** `src/components/ui/toaster.tsx`

- Desktop: top-right (unchanged)
- Mobile: bottom-center, above tab bar (bottom-20)

## 5. Todo Completion Animation

**File:** `src/app/globals.css` — new `animate-row-complete` utility
**Applied in:** Todo list row on status change to complete

- Brief green flash → fade to 60% opacity
- CSS-only, opt-in via class name
