import crypto from "crypto";

/**
 * Check if a password has appeared in known data breaches using the
 * Have I Been Pwned (HIBP) Pwned Passwords API.
 *
 * Uses k-anonymity: only the first 5 characters of the SHA-1 hash are sent
 * to the API. The full hash never leaves the server.
 *
 * @returns The number of times the password has been seen in breaches (0 = safe)
 */
export async function checkPasswordBreach(password: string): Promise<number> {
  const sha1 = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "User-Agent": "Amana-OSHC-Dashboard" },
    });

    if (!res.ok) return 0; // API unavailable — don't block the user

    const text = await res.text();
    const lines = text.split("\n");

    for (const line of lines) {
      const [hashSuffix, count] = line.trim().split(":");
      if (hashSuffix === suffix) {
        return parseInt(count, 10) || 1;
      }
    }

    return 0;
  } catch {
    // Network error — don't block the user
    return 0;
  }
}
