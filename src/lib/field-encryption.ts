/**
 * Field-level encryption for sensitive data stored in the database.
 *
 * Uses AES-256-GCM with a per-field random IV.
 * Encrypted values are prefixed with "enc:" so you can detect whether
 * a field is already encrypted.
 *
 * Usage:
 *   const encrypted = encryptField("0412345678");
 *   const plain = decryptField(encrypted);
 */

import crypto from "crypto";

const ALGO = "aes-256-gcm";
const PREFIX = "enc:";

function getKey(): Buffer {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error("FIELD_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(key, "hex");
}

export function encryptField(plaintext: string): string {
  if (!plaintext || plaintext.startsWith(PREFIX)) return plaintext;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptField(stored: string): string {
  if (!stored || !stored.startsWith(PREFIX)) return stored;
  const key = getKey();
  const payload = stored.slice(PREFIX.length);
  const [ivHex, tagHex, encHex] = payload.split(":");
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(encHex, "hex"), undefined, "utf8") + decipher.final("utf8");
}

export function isEncrypted(value: string): boolean {
  return value?.startsWith(PREFIX) ?? false;
}
