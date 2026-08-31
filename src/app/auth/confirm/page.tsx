import { redirect } from "next/navigation";

/** Supabase token-hash links are retired; Clerk owns verification and recovery. */
export default function ConfirmAuthPage() {
  redirect("/signin");
}
