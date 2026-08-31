"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, TextInput } from "@/components/form";
import { createClient } from "@/lib/supabase/client";
import { BTN_GHOST, BTN_PRIMARY } from "@/lib/ui";

type Enrollment = {
  factorId: string;
  qrCode?: string;
  secret?: string;
  existing: boolean;
};

type Factor = { id: string; factor_type: string; status: string };

type MfaPreparationApi = {
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
};

let totpPreparationQueue: Promise<void> = Promise.resolve();

/** Remove abandoned setup attempts before creating another factor. */
export function prepareTotpEnrollment(mfa: MfaPreparationApi): Promise<Enrollment> {
  const preparation = totpPreparationQueue.then(() => prepareTotpEnrollmentNow(mfa));
  totpPreparationQueue = preparation.then(
    () => undefined,
    () => undefined,
  );
  return preparation;
}

async function prepareTotpEnrollmentNow(mfa: MfaPreparationApi): Promise<Enrollment> {
  const factors = await mfa.listFactors();
  if (factors.error || !factors.data) {
    throw new Error(factors.error?.message ?? "MFA factors were not returned");
  }

  const stale = factors.data.all.filter(
    (factor) => factor.factor_type === "totp" && factor.status === "unverified",
  );
  for (const factor of stale) {
    const removed = await mfa.unenroll({ factorId: factor.id });
    if (removed.error) throw new Error(removed.error.message);
  }

  const verified = factors.data.all.find(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );
  if (verified) return { factorId: verified.id, existing: true };

  const enrolled = await mfa.enroll({
    factorType: "totp",
    friendlyName: "Maintain admin",
  });
  if (enrolled.error || !enrolled.data) {
    throw new Error(enrolled.error?.message ?? "MFA enrollment was not returned");
  }
  return {
    factorId: enrolled.data.id,
    qrCode: enrolled.data.totp.qr_code,
    secret: enrolled.data.totp.secret,
    existing: false,
  };
}

export function MfaForm({ next }: { next: string }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const prepare = async () => {
      setEnrollment(null);
      setError(undefined);
      setCode("");
      const supabase = createClient();
      try {
        const prepared = await prepareTotpEnrollment(supabase.auth.mfa);
        if (active) setEnrollment(prepared);
      } catch {
        if (active) {
          setError("Two-factor authentication could not be prepared. Try again.");
        }
      }
    };
    void prepare();
    return () => {
      active = false;
    };
  }, [attempt]);

  const verify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!enrollment || code.trim().length !== 6) {
      setError("Enter the six-digit code from your authenticator app.");
      return;
    }

    setPending(true);
    setError(undefined);
    const supabase = createClient();
    const result = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code: code.trim(),
    });
    if (result.error) {
      setPending(false);
      setError("That code was not accepted. Wait for a fresh code and try again.");
      return;
    }

    router.replace(next);
    router.refresh();
  };

  if (!enrollment && !error) {
    return <p role="status" className="text-body text-on-dark-muted">Preparing two-factor authentication…</p>;
  }

  return (
    <form onSubmit={verify} className="flex flex-col gap-(--space-4)">
      {enrollment && !enrollment.existing ? (
        <div className="flex flex-col gap-(--space-4)">
          <p className="text-body text-on-dark-muted">
            Scan this code with an authenticator app, or enter the setup key manually.
          </p>
          {enrollment.qrCode ? (
            <Image
              src={enrollment.qrCode}
              alt="Authenticator setup QR code"
              width={220}
              height={220}
              unoptimized
              className="size-[220px] rounded-(--radius-sm)"
            />
          ) : null}
          {enrollment.secret ? (
            <p className="break-all text-body text-on-dark">
              Setup key: <span className="font-semibold">{enrollment.secret}</span>
            </p>
          ) : null}
        </div>
      ) : enrollment ? (
        <p className="text-body text-on-dark-muted">
          Enter the current code from your enrolled authenticator app.
        </p>
      ) : null}

      {enrollment ? (
        <Field label="Six-digit code" name="totp_code" error={error}>
          <TextInput
            name="totp_code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            required
            error={error}
          />
        </Field>
      ) : error ? (
        <div className="flex flex-col items-start gap-(--space-3)">
          <p role="alert" className="text-body text-on-dark">{error}</p>
          <button type="button" className={BTN_GHOST} onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </button>
        </div>
      ) : null}

      {enrollment ? (
        <div className="flex flex-wrap gap-(--space-3)">
          <button type="submit" disabled={pending} className={BTN_PRIMARY}>
            {pending ? "Verifying…" : "Verify and open admin"}
          </button>
          {!enrollment.existing ? (
            <button
              type="button"
              disabled={pending}
              className={BTN_GHOST}
              onClick={() => setAttempt((value) => value + 1)}
            >
              Restart setup
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
