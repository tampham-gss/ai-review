import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Bot, GitBranch, ShieldCheck } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const [connections, providers, sessions, sessionCount] = await Promise.all([
    prisma.gitlabConnection.count({ where: { userId } }),
    prisma.aiProvider.findMany({ where: { userId } }),
    prisma.reviewSession.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { commentResults: true },
    }),
    prisma.reviewSession.count({ where: { userId } }),
  ]);

  const totalTokensUsed = providers.reduce((sum, p) => sum + p.tokensUsed, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Dashboard</h1>
        <p className="mt-1 text-slate-400">
          Kiểm tra review GitLab bằng AI — chỉ xử lý comment chưa resolved.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="h-4 w-4 text-cyan-400" />
              GitLab
            </CardTitle>
            <CardDescription>Kết nối self-hosted & gitlab.com</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{connections}</p>
            <p className="text-sm text-slate-400">kết nối đang hoạt động</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-violet-400" />
              AI Tokens
            </CardTitle>
            <CardDescription>Multi-provider với auto-failover</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalTokensUsed.toLocaleString()}</p>
            <p className="text-sm text-slate-400">tokens đã dùng</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Review Runs
            </CardTitle>
            <CardDescription>Tổng số phiên đã chạy</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{sessionCount}</p>
            <p className="text-sm text-slate-400">phiên trong lịch sử</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Bắt đầu nhanh</CardTitle>
            <CardDescription>3 bước để validate review MR</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/stats">
              <Button variant="secondary">Xem thống kê</Button>
            </Link>
            <Link href="/reviews">
              <Button>
                Tạo review mới
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {[
            "1. Kết nối GitLab (PAT cho nội bộ như gitlab.gss-sol.com)",
            "2. Chọn project, MR và convention",
            "3. Chạy validate → fix hoặc push reply invalid",
          ].map((step) => (
            <div
              key={step}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-slate-300"
            >
              {step}
            </div>
          ))}
        </CardContent>
      </Card>

      {sessions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>Phiên gần đây</CardTitle>
            <Link href="/reviews/history">
              <Button variant="secondary" size="sm">
                Xem tất cả
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {sessions.map((s) => {
                const invalid = s.commentResults.filter((c) => c.verdict === "INVALID").length;
                const valid = s.commentResults.filter((c) => c.verdict === "VALID").length;
                return (
                  <Link
                    key={s.id}
                    href={`/reviews/${s.id}`}
                    className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:bg-white/[0.05] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {s.projectPath} !{s.mrIid}
                      </p>
                      <p className="truncate text-sm text-slate-400">
                        {s.sourceBranch} · {s.status}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Badge variant="valid">{valid} valid</Badge>
                      <Badge variant="invalid">{invalid} invalid</Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
