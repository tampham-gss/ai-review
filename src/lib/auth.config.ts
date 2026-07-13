import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe config (không import prisma/bcrypt).
 * trustHost: bắt buộc trên Vercel — tránh UntrustedHost → /api/auth/error
 */
export const authConfig = {
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" as const },
  pages: {
    signIn: "/login",
    // Tránh /api/auth/error (hay 500 trên Vercel) — đưa về login kèm ?error=
    error: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      const isPublic =
        pathname === "/login" ||
        pathname === "/register" ||
        pathname.startsWith("/api/auth");

      if (!isLoggedIn && !isPublic) {
        return false;
      }

      if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
