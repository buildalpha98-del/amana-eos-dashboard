# Dashboard Bug-Fix & Feature-Completion Roadmap

**Date**: 2026-04-20
**Status**: In progress
**Scope source**: Jayden's issue dump on 2026-04-20 (~50 user-reported items) + proactive codebase audit (4 investigation agents)

## Problem statement

The dashboard has accumulated ~50 user-reported bugs and feature gaps across ~12 modules, plus a set of cross-cutting hygiene issues surfaced by a proactive audit. A single monolithic spec cannot design all of this; the work must be decomposed into independently shippable sub-projects, each with its own spec → plan → implementation cycle.

## Sub-project 0 — Investigation (complete)

Three verification questions answered, additional bugs catalogued. See session transcript for full report. Key findings:

- **Pulse data is safe** — `WeeklyPulse` model, no cleanup cron, visible only in `/communication` Team Pulse view to leaders
- **Scorecard and Contact Centre data are safe** — no weekly deletion; tickets use soft-delete, conversations use status-based archival
- **Report Issue is a silent black hole** — saves to `InternalFeedback`, no admin UI, no notification, plus a GET auth bug (claims admin-only, doesn't enforce)
- Additional hygiene issues found: 128+ routes bypass `parseJsonBody()`, 6 crons lack `acquireCronLock()`, 11 mutations missing `onError` toasts, 13 TS errors in tests, multiple `as Role`/`as any` casts

## Sub-project order and scope

| # | Name | Type | Status | Spec |
|---|------|------|--------|------|
| 0 | Investigation | read-only | ✅ done | (this doc) |
| 1 | **P0 Visible Bug Batch** | bug fix | 🏗️ design | `2026-04-20-p0-bug-batch-design.md` |
| 2 | Hygiene Sweep | systemic refactor | ⏳ queued | TBD |
| 3 | Staff / People Module Rebuild | feature | ⏳ queued | TBD |
| 4 | Services / Daily Ops Rebuild | feature | ⏳ queued | TBD |
| 5 | Documents / Policies / Compliance | feature | ⏳ queued | TBD |
| 6 | Contracts + Recruitment Rebuild | feature | ⏳ queued | TBD |
| 7 | Portal & Enrolment Flow | feature | ⏳ queued | TBD |
| 8 | AI / Queue / Onboarding / Meetings / Issues / Report Issue inbox | feature | ⏳ queued | TBD |
| 9 | Scorecard + Contact Centre + Leadership Team Centre + Pulse admin visibility | feature | ⏳ queued | TBD |

Ordering rationale: **1 first** — fastest restoration of broken flows. **2 next** — systemic hygiene gives every following sub-project a clean base. **3–9** prioritised by user-pain and dependency.

## Scope ownership rules

- User-reported bugs that are *small* live in **Sub-project 1**
- Cross-cutting hygiene (convention compliance across many files) lives in **Sub-project 2**
- New features or complete module rebuilds get their own sub-project (3–9)
- Each sub-project ships as **one PR** with a matching implementation plan doc

## Conventions

- Specs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Plans: `docs/superpowers/plans/YYYY-MM-DD-<topic>-plan.md`
- Each spec goes through the `spec-document-reviewer` loop before implementation starts
- Each sub-project is brainstormed → specced → reviewed → planned → implemented → verified → committed → merged before the next one begins
