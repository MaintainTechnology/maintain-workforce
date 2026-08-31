/**
 * Session-level MFA proof from Clerk's verified auth().factorVerificationAge (fva).
 * A second-factor age of -1 means absent or never verified; account enrollment is
 * not evidence. Only pass the server Auth object's value, never user metadata.
 *
 * This is proof for the current session, not a periodic freshness requirement.
 * Clerk's has({ reverification }) can downgrade to first-factor-only, so it must
 * not replace this check for the mandatory admin second factor.
 */
export function hasVerifiedClerkSecondFactor(factorVerificationAge: unknown): boolean {
  if (!Array.isArray(factorVerificationAge) || factorVerificationAge.length !== 2) return false;
  const [firstFactorAge, secondFactorAge] = factorVerificationAge;
  return (
    typeof firstFactorAge === "number" &&
    Number.isSafeInteger(firstFactorAge) &&
    firstFactorAge >= -1 &&
    typeof secondFactorAge === "number" &&
    Number.isSafeInteger(secondFactorAge) &&
    secondFactorAge >= 0
  );
}
