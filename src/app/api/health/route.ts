import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kiểm tra nhanh cấu hình production (không lộ secret).
 * GET https://your-app.vercel.app/api/health
 */
export async function GET() {
  const env = {
    AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
    AUTH_URL: process.env.AUTH_URL ?? null,
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
        ? "Thiếu env hoặc DB lỗi. Vercel → Settings → Environment Variables → set AUTH_SECRET, AUTH_URL=https://ai-review-two.vercel.app, AUTH_TRUST_HOST=true, DATABASE_URL, ENCRYPTION_KEY → Redeploy."
        : null,
    },
    { status: ok ? 200 : 503 },
  );
}
