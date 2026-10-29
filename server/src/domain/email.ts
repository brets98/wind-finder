/** Emails are compared trimmed and lowercased everywhere (invites, Better Auth's users). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** A deliberately loose check: one @, something before it, a dot in the domain, no spaces. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
