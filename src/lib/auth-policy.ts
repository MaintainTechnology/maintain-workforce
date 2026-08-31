type Claims = Record<string, unknown> | null | undefined;

/**
 * Keep auth return targets on this origin. Network-path references, backslashes and
 * control characters are rejected because browsers can reinterpret them as hosts.
 */
export function safeRedirectPath(
  candidate: string | null | undefined,
  fallback = "/app",
): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  if (candidate.includes("\\") || /[\u0000-\u001f\u007f]/.test(candidate)) return fallback;

  try {
    const base = new URL("https://maintain.local");
    const target = new URL(candidate, base);
    return target.origin === base.origin ? `${target.pathname}${target.search}${target.hash}` : fallback;
  } catch {
    return fallback;
  }
}

/** The platform role is trusted only when Supabase put it in immutable app metadata. */
export function isMaintainAdminClaims(claims: Claims): boolean {
  const appMetadata = claims?.app_metadata;
  return (
    typeof appMetadata === "object" &&
    appMetadata !== null &&
    (appMetadata as Record<string, unknown>).role === "maintain_admin"
  );
}

/** Enrolment is not authentication: the current, verified JWT itself must be AAL2. */
export function hasAal2(claims: Claims): boolean {
  return claims?.aal === "aal2";
}

/** A persisted invitation is not authority until its password flow is completed. */
export function hasAcceptedCompanyMembership(
  membership: { accepted_at?: unknown } | null | undefined,
): boolean {
  return membership?.accepted_at != null;
}
