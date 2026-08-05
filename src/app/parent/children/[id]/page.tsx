"use client";

/**
 * 2026-08-05: the V1/V2 switch is gone, same reasoning as the Home page —
 * NEXT_PUBLIC_PARENT_PORTAL_V2 was never set in production, so V2 had
 * never rendered for a family while every change had to be made twice.
 * Its one real feature (the learning journal) was rescued into the
 * Photos tab rather than deleted with it.
 */

import ChildDetail from "./ChildDetailV1";

export default ChildDetail;
