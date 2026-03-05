import crypto from "crypto";

// ─── Shared AES-256-GCM Encryption ──────────────────────────────────────────

function getKeyBuffer(envKey: string): Buffer {
  const key = process.env[envKey] || "";
  if (!key || key.length < 32) {
    throw new Error(`${envKey} must be at least 32 hex characters`);
  }
  return Buffer.from(key.slice(0, 64), "hex");
}

export function encrypt(plaintext: string, envKey = "XERO_ENCRYPTION_KEY"): string {
  const key = getKeyBuffer(envKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("hex"),
    encrypted.toString("hex"),
    authTag.toString("hex"),
  ].join(":");
}

export function decrypt(ciphertext: string, envKey = "XERO_ENCRYPTION_KEY"): string {
  const key = getKeyBuffer(envKey);
  const [ivHex, encryptedHex, authTagHex] = ciphertext.split(":");
  if (!ivHex || !encryptedHex || !authTagHex) {
    throw new Error("Invalid encrypted token format");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
