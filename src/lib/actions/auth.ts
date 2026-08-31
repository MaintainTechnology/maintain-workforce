"use server";

import { redirect } from "next/navigation";
import type { FormResult } from "@/lib/actions";

// Compatibility actions for stale clients. Clerk's components own credentials,
// verification, recovery and sign-out; no Supabase Auth operation is permitted here.
export async function signIn(
  _previous: FormResult | null,
  _formData: FormData,
): Promise<FormResult> {
  void _previous;
  void _formData;
  redirect("/signin");
}

export async function requestPasswordReset(
  _previous: FormResult | null,
  _formData: FormData,
): Promise<FormResult> {
  void _previous;
  void _formData;
  redirect("/signin");
}

export async function resetPassword(
  _previous: FormResult | null,
  _formData: FormData,
): Promise<FormResult> {
  void _previous;
  void _formData;
  redirect("/signin");
}

export async function acceptInvitation(
  _previous: FormResult | null,
  _formData: FormData,
): Promise<FormResult> {
  void _previous;
  void _formData;
  redirect("/signup");
}

export async function confirmEmailOtp(_formData: FormData): Promise<void> {
  void _formData;
  redirect("/signin");
}

export async function signOut(): Promise<void> {
  redirect("/signin");
}
