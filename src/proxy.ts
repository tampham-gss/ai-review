import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16: convention `proxy` thay cho `middleware`.
 * Trên HTTPS (Vercel) cookie là `__Secure-authjs.session-token` —
 * bắt buộc secureCookie: true khi gọi getToken.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth / health — luôn cho qua
  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/health")) {
    return NextResponse.next();
  }

  const isPublic =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register";

  if (!process.env.AUTH_SECRET) {
    console.error("[proxy] AUTH_SECRET is missing");
    return new NextResponse(
      "Server misconfigured: AUTH_SECRET is missing.",
      { status: 500 },
    );
  }

  const isSecure =
    request.nextUrl.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: isSecure,
  });

  const isLoggedIn = !!token;

  if (!isLoggedIn && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
