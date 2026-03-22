import { describe, it, expect } from "vitest";
import { parsePagination, paginatedResponse } from "@/lib/pagination";

describe("parsePagination", () => {
  it("returns null when no page or limit params provided", () => {
    const params = new URLSearchParams();
    expect(parsePagination(params)).toBeNull();
  });

  it("parses page and limit correctly", () => {
    const params = new URLSearchParams("page=2&limit=25");
    const result = parsePagination(params);
    expect(result).toEqual({ page: 2, limit: 25, skip: 25 });
  });

  it("defaults page to 1 when only limit is provided", () => {
    const params = new URLSearchParams("limit=10");
    const result = parsePagination(params);
    expect(result).toEqual({ page: 1, limit: 10, skip: 0 });
  });

  it("defaults limit to 50 when only page is provided", () => {
    const params = new URLSearchParams("page=3");
    const result = parsePagination(params);
    expect(result).toEqual({ page: 3, limit: 50, skip: 100 });
  });

  it("clamps page to minimum of 1", () => {
    const params = new URLSearchParams("page=0&limit=10");
    const result = parsePagination(params);
    expect(result!.page).toBe(1);
    expect(result!.skip).toBe(0);
  });

  it("clamps page to minimum of 1 for negative values", () => {
    const params = new URLSearchParams("page=-5&limit=10");
    const result = parsePagination(params);
    expect(result!.page).toBe(1);
  });

  it("clamps limit to maximum of 100", () => {
    const params = new URLSearchParams("page=1&limit=500");
    const result = parsePagination(params);
    expect(result!.limit).toBe(100);
  });

  it("treats limit=0 as falsy and defaults to 50", () => {
    const params = new URLSearchParams("page=1&limit=0");
    const result = parsePagination(params);
    // Number("0") is 0, which is falsy, so || 50 kicks in, then Math.min(100, Math.max(1, 50)) = 50
    expect(result!.limit).toBe(50);
  });

  it("clamps limit to minimum of 1 for negative values", () => {
    const params = new URLSearchParams("page=1&limit=-10");
    const result = parsePagination(params);
    // Number("-10") is -10 (truthy), Math.max(1, -10) = 1
    expect(result!.limit).toBe(1);
  });

  it("handles non-numeric page gracefully (defaults to 1)", () => {
    const params = new URLSearchParams("page=abc&limit=10");
    const result = parsePagination(params);
    expect(result!.page).toBe(1);
  });

  it("handles non-numeric limit gracefully (defaults to 50)", () => {
    const params = new URLSearchParams("page=1&limit=abc");
    const result = parsePagination(params);
    expect(result!.limit).toBe(50);
  });

  it("calculates skip correctly for page 5 with limit 20", () => {
    const params = new URLSearchParams("page=5&limit=20");
    const result = parsePagination(params);
    expect(result!.skip).toBe(80);
  });
});

describe("paginatedResponse", () => {
  it("builds correct response envelope", () => {
    const data = [{ id: 1 }, { id: 2 }];
    const result = paginatedResponse(data, 50, { page: 1, limit: 10 });
    expect(result).toEqual({
      data,
      total: 50,
      page: 1,
      limit: 10,
      totalPages: 5,
    });
  });

  it("calculates totalPages correctly with remainder", () => {
    const result = paginatedResponse([], 53, { page: 1, limit: 10 });
    expect(result.totalPages).toBe(6);
  });

  it("returns totalPages 0 for empty dataset", () => {
    const result = paginatedResponse([], 0, { page: 1, limit: 10 });
    expect(result.totalPages).toBe(0);
  });

  it("returns totalPages 1 for data less than limit", () => {
    const result = paginatedResponse([{ id: 1 }], 3, { page: 1, limit: 10 });
    expect(result.totalPages).toBe(1);
  });
});
