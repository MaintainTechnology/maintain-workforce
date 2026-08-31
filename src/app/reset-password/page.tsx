import { redirect } from "next/navigation";

/** Legacy Supabase recovery URLs now return to Clerk-managed account recovery. */
export default function ResetPasswordPage() {
  redirect("/signin");
}
