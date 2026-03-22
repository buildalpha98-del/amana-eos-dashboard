import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatCurrencyCSV, formatDateCSV, exportToCSV, exportToCsv } from "@/lib/csv-export";

// ---------------------------------------------------------------------------
// Mock DOM APIs used by export functions
// ---------------------------------------------------------------------------
const clickMock = vi.fn();
const setAttributeMock = vi.fn();

beforeEach(() => {
  clickMock.mockClear();
  setAttributeMock.mockClear();

  vi.stubGlobal("Blob", class MockBlob {
    content: unknown[];
    options: Record<string, string>;
    constructor(content: unknown[], options: Record<string, string>) {
      this.content = content;
      this.options = options;
    }
  });
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:mock-url"),
    revokeObjectURL: vi.fn(),
  });

  const mockLink = {
    href: "",
    download: "",
    click: clickMock,
    setAttribute: setAttributeMock,
  };
  vi.stubGlobal("document", {
    createElement: vi.fn(() => mockLink),
    body: {
      appendChild: vi.fn(),
      removeChild: vi.fn(),
    },
  });
});

// ---------------------------------------------------------------------------
// formatCurrencyCSV
// ---------------------------------------------------------------------------
describe("formatCurrencyCSV", () => {
  it("formats a positive value as AUD currency", () => {
    const result = formatCurrencyCSV(1234.5);
    // Intl may use narrow no-break space; normalise for assertion
    const normalised = result.replace(/\s/g, " ");
    expect(normalised).toMatch(/\$1,234\.50/);
  });

  it("formats zero", () => {
    const result = formatCurrencyCSV(0);
    expect(result).toMatch(/\$0\.00/);
  });

  it("formats a negative value", () => {
    const result = formatCurrencyCSV(-500);
    const normalised = result.replace(/\s/g, " ");
    expect(normalised).toMatch(/500\.00/);
    // Should contain a minus sign or be wrapped in parens depending on locale
    expect(normalised).toMatch(/-|\(/);
  });

  it("always shows two decimal places", () => {
    const result = formatCurrencyCSV(10);
    expect(result).toContain("10.00");
  });
});

// ---------------------------------------------------------------------------
// formatDateCSV
// ---------------------------------------------------------------------------
describe("formatDateCSV", () => {
  it("formats a Date object to DD/MM/YYYY", () => {
    // Use a UTC-unambiguous date to avoid TZ flakiness
    const result = formatDateCSV(new Date(2026, 2, 22)); // March 22 2026 local
    expect(result).toBe("22/03/2026");
  });

  it("formats an ISO date string", () => {
    // Noon UTC avoids date-rollover across timezones
    const result = formatDateCSV("2025-12-01T12:00:00Z");
    expect(result).toBe("01/12/2025");
  });

  it("formats a date-only string", () => {
    // Date-only strings are parsed as UTC midnight; result depends on local TZ
    // We just verify format shape DD/MM/YYYY
    const result = formatDateCSV("2024-06-15");
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

// ---------------------------------------------------------------------------
// escapeCsvValue — tested indirectly via exportToCSV
// ---------------------------------------------------------------------------
describe("escapeCsvValue (via exportToCSV)", () => {
  /** Helper: calls exportToCSV with a single row/column and returns the data
   *  portion of the CSV (second line). */
  function csvDataCell(value: unknown): string {
    let captured = "";
    // Intercept Blob content
    vi.stubGlobal("Blob", class {
      constructor(content: unknown[]) { captured = content[0] as string; }
    });

    exportToCSV(
      [{ v: value }],
      "test",
      [{ key: "v", header: "Val" }],
    );

    // Strip BOM, split lines, return data row
    const lines = captured.replace(/^\uFEFF/, "").split("\n");
    return lines[1]; // data row
  }

  it("returns plain text unquoted when no special chars", () => {
    expect(csvDataCell("hello")).toBe("hello");
  });

  it("wraps value in quotes when it contains a comma", () => {
    expect(csvDataCell("a,b")).toBe('"a,b"');
  });

  it("doubles internal quotes and wraps in quotes", () => {
    expect(csvDataCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps value in quotes when it contains a newline", () => {
    // csvDataCell splits on \n so we need the raw CSV instead
    let captured = "";
    vi.stubGlobal("Blob", class {
      constructor(content: unknown[]) { captured = content[0] as string; }
    });
    exportToCSV(
      [{ v: "line1\nline2" }],
      "test",
      [{ key: "v", header: "Val" }],
    );
    const csv = captured.replace(/^\uFEFF/, "");
    // Header is first line, data contains the quoted multiline value
    const dataSection = csv.split("\n").slice(1).join("\n");
    expect(dataSection).toBe('"line1\nline2"');
  });

  it("returns empty string for null", () => {
    expect(csvDataCell(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(csvDataCell(undefined)).toBe("");
  });

  it("converts numbers to string", () => {
    expect(csvDataCell(42)).toBe("42");
  });

  it("converts booleans to string", () => {
    expect(csvDataCell(true)).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// getNestedValue — tested indirectly via exportToCSV
// ---------------------------------------------------------------------------
describe("getNestedValue (via exportToCSV)", () => {
  function csvDataCell(row: Record<string, unknown>, keyPath: string): string {
    let captured = "";
    vi.stubGlobal("Blob", class {
      constructor(content: unknown[]) { captured = content[0] as string; }
    });

    exportToCSV(
      [row],
      "test",
      [{ key: keyPath, header: "H" }],
    );

    const lines = captured.replace(/^\uFEFF/, "").split("\n");
    return lines[1];
  }

  it("accesses a top-level key", () => {
    expect(csvDataCell({ name: "Alice" }, "name")).toBe("Alice");
  });

  it("accesses a nested key via dot notation", () => {
    expect(csvDataCell({ address: { city: "Sydney" } }, "address.city")).toBe("Sydney");
  });

  it("accesses deeply nested keys", () => {
    const row = { a: { b: { c: "deep" } } };
    expect(csvDataCell(row, "a.b.c")).toBe("deep");
  });

  it("returns empty string for a missing path", () => {
    expect(csvDataCell({ name: "Alice" }, "missing.path")).toBe("");
  });

  it("returns empty string when intermediate path is missing", () => {
    expect(csvDataCell({ a: { b: 1 } }, "a.x.y")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// exportToCSV — full integration (key-based / legacy API)
// ---------------------------------------------------------------------------
describe("exportToCSV", () => {
  function capturedCsv(
    data: Record<string, unknown>[],
    columns?: { key: string; header: string; formatter?: (v: unknown) => string }[],
  ): string {
    let captured = "";
    vi.stubGlobal("Blob", class {
      constructor(content: unknown[]) { captured = content[0] as string; }
    });
    exportToCSV(data, "report", columns);
    return captured.replace(/^\uFEFF/, "");
  }

  it("does nothing when data array is empty", () => {
    const createEl = vi.fn();
    vi.stubGlobal("document", { createElement: createEl, body: { appendChild: vi.fn(), removeChild: vi.fn() } });
    exportToCSV([], "empty");
    expect(createEl).not.toHaveBeenCalled();
  });

  it("auto-generates columns from object keys when none provided", () => {
    const csv = capturedCsv([{ id: 1, name: "Test" }]);
    const [header, row] = csv.split("\n");
    expect(header).toBe("id,name");
    expect(row).toBe("1,Test");
  });

  it("uses provided column definitions", () => {
    const csv = capturedCsv(
      [{ firstName: "Jo", lastName: "Smith" }],
      [
        { key: "lastName", header: "Surname" },
        { key: "firstName", header: "Given Name" },
      ],
    );
    const [header, row] = csv.split("\n");
    expect(header).toBe("Surname,Given Name");
    expect(row).toBe("Smith,Jo");
  });

  it("applies formatter when provided", () => {
    const csv = capturedCsv(
      [{ amount: 1000 }],
      [{ key: "amount", header: "Amount", formatter: (v) => formatCurrencyCSV(v as number) }],
    );
    const row = csv.split("\n")[1];
    expect(row).toMatch(/\$1,000\.00/);
    // Currency with comma should be quoted
    expect(row.startsWith('"')).toBe(true);
  });

  it("produces multiple rows", () => {
    const csv = capturedCsv([{ x: "a" }, { x: "b" }, { x: "c" }], [{ key: "x", header: "X" }]);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(4); // 1 header + 3 data
  });

  it("triggers a download via link click", () => {
    exportToCSV([{ a: 1 }], "download-test");
    expect(clickMock).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// exportToCsv — accessor-based API
// ---------------------------------------------------------------------------
describe("exportToCsv (accessor-based)", () => {
  function capturedCsv<T>(
    data: T[],
    columns: { header: string; accessor: (row: T) => string | number | boolean | null | undefined }[],
  ): string {
    let captured = "";
    vi.stubGlobal("Blob", class {
      constructor(content: unknown[]) { captured = content[0] as string; }
    });
    exportToCsv("test", data, columns);
    return captured;
  }

  it("wraps every cell in double quotes", () => {
    const csv = capturedCsv(
      [{ name: "Alice" }],
      [{ header: "Name", accessor: (r) => r.name }],
    );
    const [header, row] = csv.split("\n");
    expect(header).toBe('"Name"');
    expect(row).toBe('"Alice"');
  });

  it("doubles internal quotes in accessor values", () => {
    const csv = capturedCsv(
      [{ note: 'She said "yes"' }],
      [{ header: "Note", accessor: (r) => r.note }],
    );
    const row = csv.split("\n")[1];
    expect(row).toBe('"She said ""yes"""');
  });

  it("renders null/undefined accessor results as empty quoted string", () => {
    const csv = capturedCsv(
      [{ val: null as string | null }],
      [{ header: "V", accessor: (r) => r.val }],
    );
    const row = csv.split("\n")[1];
    expect(row).toBe('""');
  });
});
