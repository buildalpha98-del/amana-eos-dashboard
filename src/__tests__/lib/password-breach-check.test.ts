import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkPasswordBreach } from "@/lib/password-breach-check";

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
// prefix = "5BAA6", suffix = "1E4C9B93F3F0682250B6CF8331B7EE68FD8"

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("checkPasswordBreach", () => {
  it("returns breach count when password is found in HIBP response", async () => {
    const apiResponse = [
      "0018A45C4D1DEF81644B54AB7F969B88D65:1",
      "1E4C9B93F3F0682250B6CF8331B7EE68FD8:9545824",
      "00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2",
    ].join("\n");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => apiResponse,
    });

    const count = await checkPasswordBreach("password");
    expect(count).toBe(9545824);
  });

  it("returns 0 when password is not found in HIBP response", async () => {
    const apiResponse = [
      "0018A45C4D1DEF81644B54AB7F969B88D65:1",
      "00D4F6E8FA6EECAD2A3AA415EEC418D38EC:2",
      "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:5",
    ].join("\n");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => apiResponse,
    });

    const count = await checkPasswordBreach("password");
    expect(count).toBe(0);
  });

  it("returns 0 when API returns non-200 status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const count = await checkPasswordBreach("password");
    expect(count).toBe(0);
  });

  it("returns 0 on network error without throwing", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const count = await checkPasswordBreach("password");
    expect(count).toBe(0);
  });

  it("returns 0 when API returns empty response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "",
    });

    const count = await checkPasswordBreach("password");
    expect(count).toBe(0);
  });

  it("returns 0 when API returns malformed response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "not-a-valid-response\ngarbage data here",
    });

    const count = await checkPasswordBreach("password");
    expect(count).toBe(0);
  });

  it("performs case-insensitive hash comparison (API returns uppercase)", async () => {
    // The implementation uppercases the hash, and HIBP returns uppercase suffixes.
    // Verify a match works when both sides are uppercase (the standard case).
    const apiResponse =
      "1E4C9B93F3F0682250B6CF8331B7EE68FD8:42\n";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => apiResponse,
    });

    const count = await checkPasswordBreach("password");
    expect(count).toBe(42);
  });

  it("sends exactly the first 5 characters of the hash as prefix", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "",
    });

    await checkPasswordBreach("password");

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    // SHA-1("password") prefix = "5BAA6"
    expect(url).toBe("https://api.pwnedpasswords.com/range/5BAA6");
  });

  it("falls back to 1 when count is not a valid number", async () => {
    // parseInt("abc", 10) returns NaN, so || 1 kicks in
    const apiResponse =
      "1E4C9B93F3F0682250B6CF8331B7EE68FD8:abc\n";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => apiResponse,
    });

    const count = await checkPasswordBreach("password");
    expect(count).toBe(1);
  });

  it("handles trailing whitespace and \\r\\n line endings", async () => {
    const apiResponse =
      "0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n" +
      "1E4C9B93F3F0682250B6CF8331B7EE68FD8:300\r\n";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => apiResponse,
    });

    const count = await checkPasswordBreach("password");
    expect(count).toBe(300);
  });

  it("sends the User-Agent header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "",
    });

    await checkPasswordBreach("test");

    const options = mockFetch.mock.calls[0][1] as RequestInit;
    expect(options.headers).toEqual({ "User-Agent": "Amana-OSHC-Dashboard" });
  });
});
