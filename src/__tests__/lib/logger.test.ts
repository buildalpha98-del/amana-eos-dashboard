import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

describe("logger", () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("logger.info outputs in dev format during test/development", async () => {
    const { logger } = await import("@/lib/logger");
    logger.info("Test message");
    expect(consoleSpy.log).toHaveBeenCalledOnce();
    const output = consoleSpy.log.mock.calls[0][0] as string;
    expect(output).toContain("[INFO]");
    expect(output).toContain("Test message");
  });

  it("logger.warn uses console.warn", async () => {
    const { logger } = await import("@/lib/logger");
    logger.warn("Warning message");
    expect(consoleSpy.warn).toHaveBeenCalledOnce();
    const output = consoleSpy.warn.mock.calls[0][0] as string;
    expect(output).toContain("[WARN]");
  });

  it("logger.error uses console.error", async () => {
    const { logger } = await import("@/lib/logger");
    logger.error("Error message");
    expect(consoleSpy.error).toHaveBeenCalledOnce();
    const output = consoleSpy.error.mock.calls[0][0] as string;
    expect(output).toContain("[ERROR]");
  });

  it("serializes Error objects in context", async () => {
    const { logger } = await import("@/lib/logger");
    const err = new Error("Something broke");
    logger.error("Failed operation", { err });
    expect(consoleSpy.error).toHaveBeenCalledOnce();
    const output = consoleSpy.error.mock.calls[0][0] as string;
    expect(output).toContain("Something broke");
  });

  it("serializes non-Error values in err field", async () => {
    const { logger } = await import("@/lib/logger");
    logger.error("Failed", { err: "string error" });
    expect(consoleSpy.error).toHaveBeenCalledOnce();
    const output = consoleSpy.error.mock.calls[0][0] as string;
    expect(output).toContain("string error");
  });

  it("includes extra context in output", async () => {
    const { logger } = await import("@/lib/logger");
    logger.info("Processing", { userId: "u1", count: 42 });
    const output = consoleSpy.log.mock.calls[0][0] as string;
    expect(output).toContain("userId");
    expect(output).toContain("u1");
    expect(output).toContain("42");
  });

  it("handles logger.debug (may or may not output based on NODE_ENV)", async () => {
    const { logger } = await import("@/lib/logger");
    // In test env, NODE_ENV is "test" which is not "production", so MIN_LEVEL is "debug"
    logger.debug("Debug message");
    // debug should output since test env has debug as min level
    expect(consoleSpy.log).toHaveBeenCalled();
  });

  it("formats error key from context as serialized error object", async () => {
    const { logger } = await import("@/lib/logger");
    const err = new TypeError("Type mismatch");
    logger.error("Validation failed", { error: err, field: "email" });
    const output = consoleSpy.error.mock.calls[0][0] as string;
    expect(output).toContain("Type mismatch");
    expect(output).toContain("TypeError");
  });
});

describe("generateRequestId", () => {
  it("returns an 8-character string", async () => {
    const { generateRequestId } = await import("@/lib/logger");
    const id = generateRequestId();
    expect(typeof id).toBe("string");
    expect(id.length).toBe(8);
  });

  it("returns unique values on successive calls", async () => {
    const { generateRequestId } = await import("@/lib/logger");
    const ids = new Set(Array.from({ length: 20 }, () => generateRequestId()));
    expect(ids.size).toBe(20);
  });
});

describe("logger.withRequestId", () => {
  let consoleSpy: { log: ReturnType<typeof vi.spyOn> };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("includes reqId in every log entry", async () => {
    const { logger } = await import("@/lib/logger");
    const scoped = logger.withRequestId("abc-123");
    scoped.info("test message");

    const output = consoleSpy.log.mock.calls[0][0] as string;
    expect(output).toContain("abc-123");
    expect(output).toContain("test message");
  });

  it("merges reqId with additional context", async () => {
    const { logger } = await import("@/lib/logger");
    const scoped = logger.withRequestId("req-42");
    scoped.info("processing", { userId: "u1" });

    const output = consoleSpy.log.mock.calls[0][0] as string;
    expect(output).toContain("req-42");
    expect(output).toContain("u1");
  });

  it("does not have withRequestId method (no nesting)", async () => {
    const { logger } = await import("@/lib/logger");
    const scoped = logger.withRequestId("req-1");
    expect(scoped).not.toHaveProperty("withRequestId");
  });
});

describe("logger production JSON format", () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("outputs valid JSON with level, msg, and ts fields", async () => {
    const { logger } = await import("@/lib/logger");
    logger.info("Production log");

    expect(consoleSpy.log).toHaveBeenCalledOnce();
    const raw = consoleSpy.log.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("Production log");
    expect(parsed.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("includes context fields in JSON output", async () => {
    const { logger } = await import("@/lib/logger");
    logger.info("With context", { userId: "u1", count: 5 });

    const parsed = JSON.parse(consoleSpy.log.mock.calls[0][0] as string);
    expect(parsed.userId).toBe("u1");
    expect(parsed.count).toBe(5);
  });

  it("suppresses debug-level logs in production", async () => {
    const { logger } = await import("@/lib/logger");
    logger.debug("Should not appear");
    expect(consoleSpy.log).not.toHaveBeenCalled();
  });

  it("routes error-level to console.error", async () => {
    const { logger } = await import("@/lib/logger");
    logger.error("Prod error");

    expect(consoleSpy.error).toHaveBeenCalledOnce();
    const parsed = JSON.parse(consoleSpy.error.mock.calls[0][0] as string);
    expect(parsed.level).toBe("error");
    expect(parsed.msg).toBe("Prod error");
  });
});
