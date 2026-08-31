import type { Metadata } from "next";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { AuthSplit, clerkAuthAppearance } from "@/components/auth-split";
import { ctas } from "@/lib/site";

// Clerk owns every sign-in sub-step beneath this catch-all route, including password
// recovery, additional factors and SSO callbacks.
export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to the Maintain Workforce company workspace.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <AuthSplit
      heading="Welcome back"
      subheading="Sign in to your company workspace."
      quote={{
        body: "A crew was about to stand idle for three weeks. We listed the capacity on a Tuesday and they were on another site by Monday.",
        attribution: "Commercial roofing contractor",
        role: "South East Queensland",
      }}
      points={[
        "Your workspace shows the capacity you have listed and the requirements you have posted.",
        "Maintain proposes matches; your business confirms its own crew and its own rate.",
        "Engagements go live once the commercial trigger is recorded.",
      ]}
      footer={
        <>
          No account yet?{" "}
          <Link href={ctas.signUp.href} className="font-semibold text-on-dark underline underline-offset-4">
            {ctas.signUp.label}
          </Link>
        </>
      }
    >
      <SignIn
        appearance={clerkAuthAppearance}
        signUpUrl="/signup"
        fallbackRedirectUrl="/auth/continue"
      />
    </AuthSplit>
  );
}
