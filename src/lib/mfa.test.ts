import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as mfaModule from "@/components/mfa-form";

type Factor = { id: string; factor_type: string; status: string };
type PreparedEnrollment = {
  factorId: string;
  existing: boolean;
  qrCode?: string;
  secret?: string;
};

type PrepareTotpEnrollment = (mfa: {
  listFactors: () => Promise<{
    data: { all: Factor[]; totp: Factor[] } | null;
    error: { message: string } | null;
  }>;
  unenroll: (input: { factorId: string }) => Promise<{
    data: { id: string } | null;
    error: { message: string } | null;
  }>;
  enroll: (input: { factorType: "totp"; friendlyName: string }) => Promise<{
    data: { id: string; totp: { qr_code: string; secret: string } } | null;
    error: { message: string } | null;
  }>;
}) => Promise<PreparedEnrollment>;

function preparation(): PrepareTotpEnrollment | undefined {
  return (
    mfaModule as typeof mfaModule & {
      prepareTotpEnrollment?: PrepareTotpEnrollment;
    }
  ).prepareTotpEnrollment;
}

function fakeMfa(initial: Factor[]) {
  let factors = [...initial];
  let sequence = 0;
  const unenroll = vi.fn(async ({ factorId }: { factorId: string }) => {
    factors = factors.filter((factor) => factor.id !== factorId);
    return { data: { id: factorId }, error: null };
  });
  const enroll = vi.fn(async () => {
    sequence += 1;
    const factor = { id: `new-${sequence}`, factor_type: "totp", status: "unverified" };
    factors.push(factor);
    return {
      data: {
        id: factor.id,
        totp: { qr_code: `qr-${sequence}`, secret: `secret-${sequence}` },
      },
      error: null,
    };
  });
  return {
    api: {
      listFactors: async () => ({
        data: {
          all: [...factors],
          totp: factors.filter(
            (factor) => factor.factor_type === "totp" && factor.status === "verified",
          ),
        },
        error: null,
      }),
      unenroll,
      enroll,
    },
    factors: () => [...factors],
    unenroll,
    enroll,
  };
}

describe("Maintain admin TOTP preparation", () => {
  it("cleans stale unverified TOTP factors on mount and remount before enrolling", async () => {
    const prepare = preparation();
    expect(typeof prepare).toBe("function");
    if (!prepare) return;

    const mfa = fakeMfa([
      { id: "stale", factor_type: "totp", status: "unverified" },
      { id: "phone", factor_type: "phone", status: "unverified" },
    ]);
    await prepare(mfa.api);
    await prepare(mfa.api); // a remount/restart sees and replaces the prior pending factor

    expect(mfa.unenroll.mock.calls.map(([input]) => input.factorId)).toEqual([
      "stale",
      "new-1",
    ]);
    expect(mfa.enroll).toHaveBeenCalledTimes(2);
    expect(mfa.factors().filter((factor) => factor.factor_type === "totp")).toHaveLength(1);
    expect(mfa.factors().some((factor) => factor.id === "phone")).toBe(true);
  });

  it("keeps a verified TOTP factor while removing stale unverified siblings", async () => {
    const prepare = preparation();
    expect(typeof prepare).toBe("function");
    if (!prepare) return;

    const mfa = fakeMfa([
      { id: "verified", factor_type: "totp", status: "verified" },
      { id: "stale", factor_type: "totp", status: "unverified" },
    ]);
    const result = await prepare(mfa.api);

    expect(result).toMatchObject({ factorId: "verified", existing: true });
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "stale" });
    expect(mfa.enroll).not.toHaveBeenCalled();
  });

  it("serializes overlapping strict-mode preparations so only one pending factor remains", async () => {
    const prepare = preparation();
    expect(typeof prepare).toBe("function");
    if (!prepare) return;

    const mfa = fakeMfa([]);
    await Promise.all([prepare(mfa.api), prepare(mfa.api)]);

    expect(mfa.factors().filter((factor) => factor.factor_type === "totp")).toHaveLength(1);
    expect(mfa.unenroll).toHaveBeenCalledTimes(1);
  });

  it("offers an explicit restart or retry control", () => {
    const component = readFileSync(
      join(process.cwd(), "src", "components", "mfa-form.tsx"),
      "utf8",
    );
    expect(component).toMatch(/Restart setup|Try again/);
  });
});
