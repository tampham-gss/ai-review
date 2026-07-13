import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitLab from "next-auth/providers/gitlab";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { authConfig, resolveAuthUrl } from "@/lib/auth.config";

// Đảm bảo AUTH_URL có https:// trước khi NextAuth khởi tạo
const authUrl = resolveAuthUrl();
if (authUrl) {
  process.env.AUTH_URL = authUrl;
  process.env.NEXTAUTH_URL = authUrl;
}

if (!process.env.AUTH_SECRET) {
  console.error(
    "[auth] AUTH_SECRET is missing. Set it in Vercel → Environment Variables.",
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const user = await prisma.user.findUnique({
            where: { email: String(credentials.email).toLowerCase() },
          });

          if (!user?.passwordHash) return null;

          const valid = await bcrypt.compare(
            String(credentials.password),
            user.passwordHash,
          );
          if (!valid) return null;

          return { id: user.id, email: user.email, name: user.name };
        } catch (error) {
          // Thường gặp khi DATABASE_URL sai / Neon unreachable trên Vercel
          console.error("[auth] credentials authorize failed:", error);
          return null;
        }
      },
    }),
    ...(process.env.GITLAB_CLIENT_ID && process.env.GITLAB_CLIENT_SECRET
      ? [
          GitLab({
            clientId: process.env.GITLAB_CLIENT_ID,
            clientSecret: process.env.GITLAB_CLIENT_SECRET,
            authorization: {
              params: { scope: "read_api api read_user" },
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account }) {
      if (user?.id) {
        token.userId = user.id;
      }

      if (account?.provider === "gitlab" && account.access_token && user?.email) {
        try {
          const existing = await prisma.user.findUnique({
            where: { email: user.email.toLowerCase() },
          });

          const dbUser =
            existing ??
            (await prisma.user.create({
              data: {
                email: user.email.toLowerCase(),
                name: user.name ?? user.email,
              },
            }));

          token.userId = dbUser.id;

          const gitlabHost = "https://gitlab.com";
          const existingConn = await prisma.gitlabConnection.findFirst({
            where: { userId: dbUser.id, host: gitlabHost },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          });

          if (existingConn) {
            await prisma.gitlabConnection.update({
              where: { id: existingConn.id },
              data: { tokenEncrypted: encrypt(account.access_token) },
            });
          } else {
            const otherCount = await prisma.gitlabConnection.count({
              where: { userId: dbUser.id },
            });
            await prisma.gitlabConnection.create({
              data: {
                userId: dbUser.id,
                name: "GitLab.com",
                host: gitlabHost,
                tokenEncrypted: encrypt(account.access_token),
                isDefault: otherCount === 0,
              },
            });
          }
        } catch (error) {
          console.error("[auth] gitlab jwt callback failed:", error);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
