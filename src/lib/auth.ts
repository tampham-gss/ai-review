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
          if (user.isDisabled) return null;

          const valid = await bcrypt.compare(
            String(credentials.password),
            user.passwordHash,
          );
          if (!valid) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role === "admin" ? "admin" : "user",
          };
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
    async jwt({ token, user, account, trigger, session }) {
      if (user?.id) {
        token.userId = user.id;
        // Luôn đọc role từ DB khi login — tránh mất field custom từ Credentials
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { role: true, isDisabled: true, name: true, email: true },
          });
          if (!dbUser || dbUser.isDisabled) {
            token.userId = undefined;
            token.role = undefined;
          } else {
            token.role = dbUser.role === "admin" ? "admin" : "user";
            token.name = dbUser.name;
            token.email = dbUser.email;
          }
        } catch {
          token.role = user.role === "admin" ? "admin" : "user";
        }
      }

      if (trigger === "update" && token.userId) {
        if (session?.name !== undefined) token.name = session.name;
        if (session?.email !== undefined) token.email = session.email;
      }

      // Refresh role/disabled từ DB trên các request sau
      if (token.userId && !user) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.userId as string },
            select: { role: true, isDisabled: true, name: true, email: true },
          });
          if (!dbUser || dbUser.isDisabled) {
            token.userId = undefined;
            token.role = undefined;
          } else {
            token.role = dbUser.role === "admin" ? "admin" : "user";
            token.name = dbUser.name;
            token.email = dbUser.email;
          }
        } catch {
          // giữ token cũ nếu DB lỗi tạm
        }
      }

      if (account?.provider === "gitlab" && account.access_token && user?.email) {
        try {
          const existing = await prisma.user.findUnique({
            where: { email: user.email.toLowerCase() },
          });

          if (existing?.isDisabled) {
            token.userId = undefined;
            token.role = undefined;
            return token;
          }

          const dbUser =
            existing ??
            (await prisma.user.create({
              data: {
                email: user.email.toLowerCase(),
                name: user.name ?? user.email,
                role: "user",
              },
            }));

          token.userId = dbUser.id;
          token.role = dbUser.role === "admin" ? "admin" : "user";

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
        session.user.role = token.role === "admin" ? "admin" : "user";
      }
      return session;
    },
  },
});
