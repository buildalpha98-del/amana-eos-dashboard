"use client";

/**
 * 2026-08-04: the V1/V2 switch is gone.
 *
 * `useV2Flag` read NEXT_PUBLIC_PARENT_PORTAL_V2, which was never set in
 * production — I decompiled the deployed bundle to check, and the env
 * branch had been folded away entirely. So HomeV2 had never rendered for
 * a single family, while every change to Home had to be made twice or
 * silently rot in the copy nobody could reach.
 */

import ParentHome from "./HomeV1";

export default ParentHome;
