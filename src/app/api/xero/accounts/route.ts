import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { xeroApiRequest } from "@/lib/xero";

interface XeroAccount {
  Code: string;
  Name: string;
  Type: string;
  Status: string;
  Class: string;
  [key: string]: unknown;
}

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

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
    console.error("Failed to fetch Xero accounts:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}
