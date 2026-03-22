import { NextRequest, NextResponse } from "next/server";
import { xeroApiRequest } from "@/lib/xero";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

interface XeroAccount {
  Code: string;
  Name: string;
  Type: string;
  Status: string;
  Class: string;
  [key: string]: unknown;
}

export const GET = withApiAuth(async (req, session) => {
  try {
    const data = await xeroApiRequest("/Accounts");

    const filtered = (data.Accounts as XeroAccount[])
      .filter(
        (account) =>
          account.Status === "ACTIVE" &&
          (account.Type === "REVENUE" ||
            account.Type === "EXPENSE" ||
            account.Class === "REVENUE" ||
            account.Class === "EXPENSE")
      )
      .sort((a, b) => (a.Code || "").localeCompare(b.Code || ""));

    return NextResponse.json(filtered);
  } catch (err) {
    logger.error("Failed to fetch Xero accounts", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}, { roles: ["owner", "head_office", "admin"] });
