"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function authErrorMessage(code: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case "Configuration":
      return "Lỗi cấu hình Auth (AUTH_SECRET / AUTH_URL). Kiểm tra Environment Variables trên Vercel rồi Redeploy.";
    case "AccessDenied":
      return "Truy cập bị từ chối.";
    case "Verification":
      return "Token xác thực không hợp lệ hoặc đã hết hạn.";
    case "OAuthSignin":
    case "OAuthCallback":
    case "OAuthCreateAccount":
    case "Callback":
      return "Đăng nhập OAuth thất bại. Kiểm tra GITLAB_CLIENT_ID/SECRET và Callback URL trên GitLab.";
    case "CredentialsSignin":
      return "Email hoặc mật khẩu không đúng (hoặc DB không kết nối được).";
    default:
      return `Đăng nhập thất bại (${code}).`;
  }
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [gitlabOAuthEnabled, setGitlabOAuthEnabled] = useState(false);

  useEffect(() => {
    const fromUrl = authErrorMessage(searchParams.get("error"));
    if (fromUrl) setError(fromUrl);

    fetch("/api/auth/providers")
      .then((res) => res.json())
      .then((providers) => setGitlabOAuthEnabled(!!providers?.gitlab))
      .catch(() => setGitlabOAuthEnabled(false));
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/dashboard",
      });

      if (result?.error) {
        setError(
          authErrorMessage(result.error) ??
            "Email hoặc mật khẩu không đúng / không kết nối được database.",
        );
        setLoading(false);
        return;
      }

      // Hard navigation: đảm bảo cookie session được gửi kèm request tiếp theo
      // (router.push RSC dễ kẹt khi proxy/middleware vừa đọc cookie)
      const next = searchParams.get("callbackUrl") || "/dashboard";
      window.location.assign(next.startsWith("/") ? next : "/dashboard");
    } catch {
      setError("Không gọi được /api/auth. Kiểm tra AUTH_SECRET và DATABASE_URL trên Vercel.");
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đăng nhập</CardTitle>
        <CardDescription>Email/password hoặc GitLab.com OAuth</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>

        {gitlabOAuthEnabled && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-transparent px-2 text-slate-500">hoặc</span>
              </div>
            </div>

            <Button
              variant="secondary"
              className="w-full"
              onClick={() => signIn("gitlab", { callbackUrl: "/dashboard" })}
            >
              Đăng nhập GitLab.com
            </Button>
          </>
        )}

        <p className="text-center text-sm text-slate-400">
          Chưa có tài khoản?{" "}
          <Link href="/register" className="text-violet-300 hover:underline">
            Đăng ký
          </Link>
        </p>
        <p className="text-center text-xs text-slate-500">
          GitLab nội bộ (vd. gitlab.gss-sol.com): đăng ký/đăng nhập email → Connect GitLab bằng PAT.
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <MarketingShell>
      <Suspense fallback={<p className="text-slate-400">Đang tải...</p>}>
        <LoginForm />
      </Suspense>
    </MarketingShell>
  );
}
