import type { NextAuthConfig } from "next-auth";

/** Chuẩn hóa AUTH_URL — thiếu https:// sẽ làm toàn bộ /api/auth/* trả 500. */
export function resolveAuthUrl(): string | undefined {
  const raw = process.env.AUTH_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
  if (!raw) return undefined;

  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, "");
  return `https://${raw.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

const authUrl = resolveAuthUrl();
if (authUrl) {
  process.env.AUTH_URL = authUrl;
  process.env.NEXTAUTH_URL = authUrl;
}

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
        pathname === "/forgot-password" ||
        pathname.startsWith("/api/auth");

      if (!isLoggedIn && !isPublic) {
        return false;
      }

      if (
        isLoggedIn &&
        (pathname === "/login" ||
          pathname === "/register" ||
          pathname === "/forgot-password")
      ) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
