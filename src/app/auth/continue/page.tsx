import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isMaintainAdmin, requireCompanyAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Route a completed Clerk sign-in according to authoritative role and membership. */
export default async function ContinueAfterAuthentication() {
  const user = await currentUser();
  if (!user) redirect("/signin");

  if (isMaintainAdmin(user.publicMetadata as Record<string, unknown>)) {
    redirect("/admin");
  }

  // This also consumes an accepted Clerk invitation. Unbound users are sent to
  // post-registration company onboarding by requireCompanyAdmin().
  await requireCompanyAdmin();
  redirect("/app");
}
