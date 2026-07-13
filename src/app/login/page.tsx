"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [gitlabOAuthEnabled, setGitlabOAuthEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((res) => res.json())
      .then((providers) => setGitlabOAuthEnabled(!!providers?.gitlab))
      .catch(() => setGitlabOAuthEnabled(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);
    if (result?.error) {
      setError("Email hoặc mật khẩu không đúng");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <MarketingShell>
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
    </MarketingShell>
  );
}
