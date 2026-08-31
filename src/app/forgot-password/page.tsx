import { redirect } from "next/navigation";

/** Clerk owns password recovery inside its sign-in component. */
export default function ForgotPasswordPage() {
  redirect("/signin");
}
