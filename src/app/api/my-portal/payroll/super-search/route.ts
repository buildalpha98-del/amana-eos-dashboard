/**
 * GET /api/my-portal/payroll/super-search?term= — search Employment Hero's
 * fund directory so staff pick a real fund (and its product code / USI)
 * instead of typing a name payroll can't pay into.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { isConfigured, searchSuperProducts } from "@/lib/eh-payroll";

export const GET = withApiAuth(async (req) => {
  const term = new URL(req.url).searchParams.get("term")?.trim() ?? "";
  if (!isConfigured() || term.length < 3) return NextResponse.json({ funds: [] });
  const products = await searchSuperProducts(term);
  return NextResponse.json({
    funds: products
      .filter((p) => p.productCode)
      .slice(0, 20)
      .map((p) => ({
        productCode: p.productCode,
        name: p.displayName || p.productName || p.businessName || p.productCode,
        abn: p.abn,
      })),
  });
});
