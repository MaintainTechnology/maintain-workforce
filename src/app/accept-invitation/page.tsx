import { redirect } from "next/navigation";

/** Clerk invitations complete through the Clerk sign-up route. */
export default function AcceptInvitationPage() {
  redirect("/signup");
}
