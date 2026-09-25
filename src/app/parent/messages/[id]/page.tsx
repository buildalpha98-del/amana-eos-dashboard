"use client";

/**
 * 2026-09-25: the V1/V2 switch is gone, same reasoning as Home, Child Detail,
 * Bookings and Messages — NEXT_PUBLIC_PARENT_PORTAL_V2 was never set in
 * production, so ThreadV2 had never rendered for a single family while every
 * change to the thread view had to be made twice or silently rot in the copy
 * nobody could reach. This was the last caller of `useV2Flag`, which is now
 * deleted along with it.
 */

import ThreadV1 from "./ThreadV1";

export default ThreadV1;
