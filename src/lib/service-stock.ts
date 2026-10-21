/**
 * Centre stock & resources list (Daniel, 21 Oct 2026). Centres used to email
 * their stocktake to head office; now they keep the list themselves on the
 * service page (Program → Resources & stock), and "Send stocktake" tells head
 * office. The same StockItem rows show in Amana HQ, and Cowork can still post
 * them (/api/cowork/accounts `stock`) — one list, whoever updates it.
 */
import { z } from "zod";

export const STOCK_TYPES = ["consumable", "durable"] as const;

export const stockItemSchema = z.object({
  item: z.string().trim().min(1, "Name the item").max(200),
  category: z.string().trim().max(80).nullable().optional(),
  type: z.enum(STOCK_TYPES).default("consumable"),
  qtyOnHand: z.number().nonnegative().max(100_000).nullable().optional(),
  unit: z.string().trim().max(40).nullable().optional(),
  reorderAt: z.number().nonnegative().max(100_000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/** At or under its reorder level (both must be known). */
export function needsReorder(s: { qtyOnHand: number | null; reorderAt: number | null }): boolean {
  return s.qtyOnHand != null && s.reorderAt != null && s.qtyOnHand <= s.reorderAt;
}
