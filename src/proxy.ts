import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Clerk owns the session for every protected surface. The layouts repeat the
// authorization checks close to the data they guard; Proxy supplies the fast,
// optimistic redirect and the pathname header used by the admin MFA route.
export const proxy = clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;
  const isAppRoute = pathname === "/app" || pathname.startsWith("/app/");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  if (!isAppRoute && !isAdminRoute) return;

  const authState = await auth();
  if (!authState.userId) {
    return authState.redirectToSignIn({ returnBackUrl: request.url });
  }

  if (isAdminRoute) {
    // This is only an early rejection. requireMaintainAdmin() reads authoritative
    // Backend API metadata in the layout before any admin data is exposed.
    const metadata = (authState.sessionClaims?.metadata ??
      authState.sessionClaims?.publicMetadata) as { role?: string } | undefined;
    if (metadata?.role && metadata.role !== "maintain_admin") {
      return NextResponse.redirect(new URL("/app", request.url));
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
