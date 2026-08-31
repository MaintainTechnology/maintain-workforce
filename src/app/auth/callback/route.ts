import { NextResponse, type NextRequest } from "next/server";

/** Retained as a safe landing for stale Supabase callback links. */
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/signin", request.url));
}
