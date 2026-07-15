/**
 * Generate a strong temporary password for invited staff.
 *
 * 12 chars, guaranteed at least one upper / lower / digit / special, drawn
 * from an unambiguous alphabet (no O/0, I/l/1) using crypto-secure randomness
 * and a Fisher-Yates shuffle. Used by the single-staff invite
 * (POST /api/users invite mode) and the bulk importer so both share one
 * implementation.
 */
export function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;

  const randomBytes = new Uint8Array(12);
  crypto.getRandomValues(randomBytes);

  // Guarantee one of each required class.
  let pwd = "";
  pwd += upper[randomBytes[0] % upper.length];
  pwd += lower[randomBytes[1] % lower.length];
  pwd += digits[randomBytes[2] % digits.length];
  pwd += special[randomBytes[3] % special.length];

  // Fill the remaining 8 chars.
  for (let i = 0; i < 8; i++) {
    pwd += all[randomBytes[4 + i] % all.length];
  }

  // Shuffle so the guaranteed classes aren't always in positions 0-3.
  const shuffleBytes = new Uint8Array(pwd.length);
  crypto.getRandomValues(shuffleBytes);
  const arr = pwd.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = shuffleBytes[i] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}
