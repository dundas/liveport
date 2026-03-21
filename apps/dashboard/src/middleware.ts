import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that don't require authentication
const publicPaths = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/pricing",
  "/api/auth",
  "/api/agent", // Agent API uses Bearer token auth, not session cookies
  "/api/docs",
  "/api/health",
  "/api/cli",
  "/cli",
  "/install",
  "/install.sh",
  "/docs",
  "/terms",
  "/privacy",
  "/status",
  "/llms.txt",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the path is public
  const isPublicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(path + "/")
  );

  // Get session token from cookie (may have __Secure- prefix in production)
  const sessionToken =
    request.cookies.get("__Secure-session") ||
    request.cookies.get("session");

  // If accessing protected route without session, redirect to login
  if (!isPublicPath && !sessionToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If accessing auth routes with session, redirect to dashboard
  if (isPublicPath && sessionToken && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/auth).*)",
  ],
};
