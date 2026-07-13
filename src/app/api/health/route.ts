import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveAuthUrl } from "@/lib/auth.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kiểm tra nhanh cấu hình production (không lộ secret).
 * GET https://your-app.vercel.app/api/health
 */
export async function GET() {
  const rawAuthUrl = process.env.AUTH_URL ?? null;
  const resolvedAuthUrl = resolveAuthUrl() ?? null;
  const authUrlOk = !!resolvedAuthUrl && /^https?:\/\//i.test(resolvedAuthUrl);

  const env = {
    AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
    AUTH_URL: rawAuthUrl,
    AUTH_URL_RESOLVED: resolvedAuthUrl,
    AUTH_URL_OK: authUrlOk,
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? null,
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    ENCRYPTION_KEY: Boolean(process.env.ENCRYPTION_KEY),
  };

  let database: "ok" | "error" = "ok";
  let databaseError: string | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    database = "error";
    databaseError = error instanceof Error ? error.message : String(error);
  }

  const ok =
    env.AUTH_SECRET &&
    authUrlOk &&
    env.DATABASE_URL &&
    env.ENCRYPTION_KEY &&
    database === "ok";

  return NextResponse.json(
    {
      ok,
      env,
      database,
      databaseError,
      hint: !ok
        ? !authUrlOk
          ? 'AUTH_URL phải có protocol, ví dụ: https://ai-review-two.vercel.app (hiện tại thiếu https://)'
          : "Thiếu env hoặc DB lỗi. Vercel → Settings → Environment Variables → Redeploy."
        : null,
    },
    { status: ok ? 200 : 503 },
  );
}
