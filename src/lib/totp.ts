/**
 * TOTP (Time-based One-Time Password) utilities for MFA.
 *
 * Uses otpauth library with SHA-1, 6-digit codes, 30s period (standard).
 * Secrets are encrypted at rest using AES-256-GCM before storing in the database.
 */

import { TOTP, Secret } from "otpauth";
import crypto from "crypto";

const ISSUER = "Amana OSHC";
const ALGO = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const key = process.env.MFA_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error("MFA_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(key, "hex");
}

// ── Encrypt / Decrypt secrets ────────────────────────────────

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(stored: string): string {
  const key = getEncryptionKey();
  const [ivHex, tagHex, encHex] = stored.split(":");
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(encHex, "hex"), undefined, "utf8") + decipher.final("utf8");
}

// ── TOTP operations ─────────────────────────────────────────

export function generateSecret(): { secret: string; encryptedSecret: string } {
  const secret = new Secret({ size: 20 });
  const base32 = secret.base32;
  return {
    secret: base32,
    encryptedSecret: encryptSecret(base32),
  };
}

export function generateTotpUri(secret: string, userEmail: string): string {
  const totp = new TOTP({ issuer: ISSUER, label: userEmail, secret: Secret.fromBase32(secret) });
  return totp.toString();
}

export function verifyTotp(secret: string, token: string): boolean {
  const totp = new TOTP({ issuer: ISSUER, secret: Secret.fromBase32(secret), period: 30 });
  // Allow 1 period of drift in each direction
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

// ── Backup codes ────────────────────────────────────────────

export function generateBackupCodes(count = 8): { codes: string[]; hashes: string[] } {
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString("hex"); // 8-char hex code
    codes.push(code);
    hashes.push(crypto.createHash("sha256").update(code).digest("hex"));
  }
  return { codes, hashes };
}

export function verifyBackupCode(code: string, hashes: string[]): { valid: boolean; remainingHashes: string[] } {
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  const index = hashes.indexOf(codeHash);
  if (index === -1) return { valid: false, remainingHashes: hashes };
  // Remove used code
  const remainingHashes = [...hashes];
  remainingHashes.splice(index, 1);
  return { valid: true, remainingHashes };
}
