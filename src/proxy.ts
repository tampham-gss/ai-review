import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js 16: convention `proxy` thay cho `middleware`.
 * Dùng getToken (jose / Edge-safe) thay vì NextAuth(...).auth để tránh
 * MIDDLEWARE_INVOCATION_FAILED trên Vercel.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/api/auth");

  // Luôn cho qua auth endpoints — không chặn callback OAuth
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (!process.env.AUTH_SECRET) {
    console.error("[proxy] AUTH_SECRET is missing — set it in Vercel Environment Variables");
    return new NextResponse(
      "Server misconfigured: AUTH_SECRET is missing. Add it in Vercel → Settings → Environment Variables.",
      { status: 500 },
    );
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
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
  matcher: [
    /*
     * Bỏ qua static assets & file có extension.
     * Không chạy proxy trên _next và favicon.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
