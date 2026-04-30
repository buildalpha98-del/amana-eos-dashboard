import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt } from "@/lib/encryption";
import { encryptField, decryptField, isEncrypted } from "@/lib/field-encryption";

const VALID_KEY = "a".repeat(64); // 64 hex chars = 32 bytes

beforeEach(() => {
  process.env.XERO_ENCRYPTION_KEY = VALID_KEY;
  process.env.FIELD_ENCRYPTION_KEY = VALID_KEY;
});

afterEach(() => {
  delete process.env.XERO_ENCRYPTION_KEY;
  delete process.env.FIELD_ENCRYPTION_KEY;
});

// ─── encrypt / decrypt (encryption.ts) ──────────────────────────────────────

describe("encrypt / decrypt", () => {
  it("round-trip preserves plaintext", () => {
    const plaintext = "hello world";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("returns iv:encrypted:authTag format (3 colon-separated hex parts)", () => {
    const result = encrypt("test");
    const parts = result.split(":");
    expect(parts).toHaveLength(3);
    for (const part of parts) {
      expect(part).toMatch(/^[0-9a-f]+$/);
    }
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).not.toBe(b);
    // But both must decrypt to the same value
    expect(decrypt(a)).toBe("same");
    expect(decrypt(b)).toBe("same");
  });

  it("throws when the env var is missing", () => {
    delete process.env.XERO_ENCRYPTION_KEY;
    expect(() => encrypt("data")).toThrow("XERO_ENCRYPTION_KEY");
  });

  it("throws when the env key is shorter than 32 hex chars", () => {
    process.env.XERO_ENCRYPTION_KEY = "abcd"; // 4 chars, way too short
    expect(() => encrypt("data")).toThrow("at least 32 hex characters");
  });

  it("throws on tampered ciphertext (modified encrypted portion)", () => {
    const encrypted = encrypt("secret");
    const [iv, enc, tag] = encrypted.split(":");
    // 2026-04-30: deterministic byte-flip via XOR. Earlier this test simply
    // overwrote the first byte with "ff" — which collided with the
    // original byte ~1/256 of the time (random IV → random ciphertext),
    // producing an identical "tampered" string and a flaky pass.
    // XOR-flipping every bit guarantees the byte changes regardless of
    // its original value, and AES-GCM's auth tag will always reject it.
    const firstByte = parseInt(enc.slice(0, 2), 16);
    const flippedByte = (firstByte ^ 0xff).toString(16).padStart(2, "0");
    const tampered = [iv, flippedByte + enc.slice(2), tag].join(":");
    expect(tampered).not.toBe(encrypted); // pre-condition: bytes really differ
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on tampered authTag", () => {
    const encrypted = encrypt("secret");
    const [iv, enc, tag] = encrypted.split(":");
    const tampered = [iv, enc, "00".repeat(tag.length / 2)].join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on invalid format (missing parts)", () => {
    expect(() => decrypt("onlyonepart")).toThrow("Invalid encrypted token format");
    expect(() => decrypt("two:parts")).toThrow("Invalid encrypted token format");
  });

  it("encrypting an empty string produces valid format but decrypt rejects the empty ciphertext part", () => {
    const encrypted = encrypt("");
    // Empty plaintext produces an empty hex middle segment (iv::authTag)
    // which decrypt rejects because !encryptedHex is true for ""
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    expect(parts[1]).toBe(""); // empty encrypted portion
    expect(() => decrypt(encrypted)).toThrow("Invalid encrypted token format");
  });

  it("handles unicode content", () => {
    const text = "Hello \u{1F600} \u00E9\u00E0\u00FC \u4F60\u597D";
    expect(decrypt(encrypt(text))).toBe(text);
  });

  it("accepts a custom env key name", () => {
    process.env.MY_CUSTOM_KEY = VALID_KEY;
    const encrypted = encrypt("custom", "MY_CUSTOM_KEY");
    expect(decrypt(encrypted, "MY_CUSTOM_KEY")).toBe("custom");
    delete process.env.MY_CUSTOM_KEY;
  });
});

// ─── encryptField / decryptField / isEncrypted (field-encryption.ts) ────────

describe("encryptField / decryptField", () => {
  it('adds "enc:" prefix to encrypted output', () => {
    const result = encryptField("0412345678");
    expect(result.startsWith("enc:")).toBe(true);
  });

  it("round-trips through encryptField and decryptField", () => {
    const plain = "sensitive-data-123";
    const encrypted = encryptField(plain);
    expect(decryptField(encrypted)).toBe(plain);
  });

  it("is idempotent (does not double-encrypt already-encrypted values)", () => {
    const encrypted = encryptField("phone");
    const doubleEncrypted = encryptField(encrypted);
    expect(doubleEncrypted).toBe(encrypted);
    expect(decryptField(doubleEncrypted)).toBe("phone");
  });

  it("decryptField returns non-encrypted strings as-is", () => {
    expect(decryptField("plaintext")).toBe("plaintext");
    expect(decryptField("no-prefix-here")).toBe("no-prefix-here");
  });

  it("decryptField returns empty string as-is", () => {
    expect(decryptField("")).toBe("");
  });

  it("encryptField returns empty string as-is", () => {
    const result = encryptField("");
    expect(result).toBe("");
  });

  it("encryptField returns null/undefined as-is", () => {
    // The function signature takes string, but the implementation guards with !plaintext
    expect(encryptField(null as unknown as string)).toBeNull();
    expect(encryptField(undefined as unknown as string)).toBeUndefined();
  });

  it("decryptField returns null/undefined as-is", () => {
    expect(decryptField(null as unknown as string)).toBeNull();
    expect(decryptField(undefined as unknown as string)).toBeUndefined();
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    const a = encryptField("same");
    const b = encryptField("same");
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe("same");
    expect(decryptField(b)).toBe("same");
  });

  it("throws when FIELD_ENCRYPTION_KEY is missing", () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(() => encryptField("data")).toThrow("FIELD_ENCRYPTION_KEY");
  });

  it("throws when FIELD_ENCRYPTION_KEY is not exactly 64 chars", () => {
    process.env.FIELD_ENCRYPTION_KEY = "a".repeat(32); // 32 instead of 64
    expect(() => encryptField("data")).toThrow("64-char hex string");
  });

  it("encrypted output has enc:iv:tag:data format (prefix + 3 hex parts)", () => {
    const result = encryptField("test");
    expect(result.startsWith("enc:")).toBe(true);
    const payload = result.slice(4); // strip "enc:"
    const parts = payload.split(":");
    expect(parts).toHaveLength(3);
    for (const part of parts) {
      expect(part).toMatch(/^[0-9a-f]+$/);
    }
  });
});

describe("isEncrypted", () => {
  it('returns true for strings starting with "enc:"', () => {
    expect(isEncrypted("enc:abc123")).toBe(true);
    expect(isEncrypted("enc:")).toBe(true);
  });

  it("returns false for plain strings", () => {
    expect(isEncrypted("plaintext")).toBe(false);
    expect(isEncrypted("")).toBe(false);
    expect(isEncrypted("encrypted-but-no-prefix")).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isEncrypted(null as unknown as string)).toBe(false);
    expect(isEncrypted(undefined as unknown as string)).toBe(false);
  });

  it("correctly identifies output of encryptField", () => {
    const encrypted = encryptField("test");
    expect(isEncrypted(encrypted)).toBe(true);
    expect(isEncrypted("test")).toBe(false);
  });
});
