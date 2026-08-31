import type { Metadata } from "next";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { AuthSplit, clerkAuthAppearance } from "@/components/auth-split";
import { ctas } from "@/lib/site";

// Registration is deliberately two steps: Clerk establishes the account here, then
// /onboarding collects company details from the authenticated person.
export const metadata: Metadata = {
  title: "Register your company",
  description:
    "Register your construction business on Maintain Workforce. Maintain verifies your ABN, if supplied, and compliance documents, then your company can list spare capacity and post requirements.",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <AuthSplit
      heading="Register your company"
      subheading="Create your sign-in first. Company details come next."
      quote={{
        body: "We stopped losing good tradespeople between projects. The exchange keeps them working, and they stay on our books.",
        attribution: "Fit-out carpentry business",
        role: "Inner Brisbane",
      }}
      points={[
        "Create your sign-in, then tell us about the business.",
        "Maintain verifies your ABN, if supplied, plus insurance and licences against the documents you upload.",
        "Once your company is Active it can list spare capacity and post requirements.",
      ]}
      footer={
        <>
          Already registered?{" "}
          <Link href={ctas.signIn.href} className="font-semibold text-on-dark underline underline-offset-4">
            {ctas.signIn.label}
          </Link>
        </>
      }
    >
      <SignUp
        appearance={clerkAuthAppearance}
        forceRedirectUrl="/onboarding"
        signInUrl="/signin"
      />
    </AuthSplit>
  );
}
