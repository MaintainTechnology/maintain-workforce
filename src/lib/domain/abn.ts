// ABN validation — spec 1.2. Inline, per the Constraints section: roughly twenty
// lines and no dependency. The ABR lookup API is explicitly v2 (Non-goals).

const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

/** Strip spaces so "51 824 753 556" and "51824753556" are the same ABN. */
export function normaliseAbn(input: string): string {
  return input.replace(/\s/g, "");
}

/**
 * The standard 11-digit ABN checksum: subtract 1 from the first digit, apply the
 * positional weights, and the weighted sum must divide by 89.
 */
export function isValidAbn(input: string): boolean {
  const abn = normaliseAbn(input);
  if (!/^\d{11}$/.test(abn)) return false;

  const digits = abn.split("").map(Number);
  digits[0] -= 1;

  const sum = digits.reduce((total, digit, i) => total + digit * WEIGHTS[i], 0);
  return sum % 89 === 0;
}

/** Display form: "51 824 753 556" — grouped 2-3-3-3 as the ABR prints it. */
export function formatAbn(input: string): string {
  const abn = normaliseAbn(input);
  if (!/^\d{11}$/.test(abn)) return input;
  return `${abn.slice(0, 2)} ${abn.slice(2, 5)} ${abn.slice(5, 8)} ${abn.slice(8, 11)}`;
}
