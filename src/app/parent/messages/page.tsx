"use client";

/**
 * 2026-09-25: the V1/V2 switch is gone, same reasoning as Home and Child
 * Detail — NEXT_PUBLIC_PARENT_PORTAL_V2 was never set in production, so
 * MessagesV2 had never rendered for a single family while every change to
 * Messages had to be made twice or silently rot in the copy nobody could
 * reach.
 */

import ParentMessages from "./MessagesV1";

export default ParentMessages;
