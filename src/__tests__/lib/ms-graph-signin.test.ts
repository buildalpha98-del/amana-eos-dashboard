import { describe, it, expect } from "vitest";
import { signInFailureMessage } from "@/lib/ms-graph";

describe("signInFailureMessage", () => {
  it("names the secret when Microsoft says it's invalid", () => {
    const m = signInFailureMessage({
      error: "invalid_client",
      error_description: "AADSTS7000215: Invalid client secret provided.\r\nTrace ID: x",
    });
    expect(m).toContain("VALUE (not the Secret ID)");
    expect(m).toContain("AADSTS7000215");
  });

  it("names the client ID when the app isn't in the tenant", () => {
    expect(signInFailureMessage({ error_description: "AADSTS700016: Application not found" })).toContain(
      "MS_GRAPH_CLIENT_ID",
    );
  });

  it("falls back to Microsoft's first line for anything else", () => {
    expect(signInFailureMessage({ error_description: "AADSTS1234: Something odd.\r\nTrace" })).toContain(
      "AADSTS1234: Something odd.",
    );
  });
});
