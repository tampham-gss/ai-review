"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Step = "email" | "reset";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    setMessage("");
    setDevOtp("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "reset" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Gửi OTP thất bại");
        return;
      }
      setMessage(data.message ?? "Đã gửi OTP");
      if (data.devOtp) setDevOtp(data.devOtp);
      setStep("reset");
    } catch {
      setError("Lỗi kết nối khi gửi OTP");
    } finally {
      setSending(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    setResetting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          otp,
          newPassword,
          purpose: "reset",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Đặt lại mật khẩu thất bại");
        return;
      }
      setMessage(data.message ?? "Đã đổi mật khẩu");
      setTimeout(() => router.push("/login"), 1200);
    } catch {
      setError("Lỗi kết nối khi đặt lại mật khẩu");
    } finally {
      setResetting(false);
    }
  }

  return (
    <MarketingShell>
      <Card>
        <CardHeader>
          <CardTitle>Quên mật khẩu</CardTitle>
          <CardDescription>
            Nhập email (username) để nhận OTP và đặt mật khẩu mới.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "email" ? (
            <form onSubmit={requestOtp} className="space-y-3">
              <Input
                type="email"
                placeholder="Email đăng nhập"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
              {message && <p className="text-sm text-emerald-400">{message}</p>}
              <Button type="submit" className="w-full" loading={sending}>
                {sending ? "Đang gửi OTP..." : "Gửi mã OTP"}
              </Button>
            </form>
          ) : (
            <form onSubmit={resetPassword} className="space-y-3">
              <Input type="email" value={email} readOnly className="opacity-70" />
              <Input
                placeholder="Mã OTP 6 số"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                inputMode="numeric"
                maxLength={8}
              />
              {devOtp && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  Dev OTP: <span className="font-mono font-bold">{devOtp}</span>
                </p>
              )}
              <Input
                type="password"
                placeholder="Mật khẩu mới (≥ 8 ký tự)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
              <Input
                type="password"
                placeholder="Xác nhận mật khẩu mới"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
              {error && <p className="text-sm text-red-400">{error}</p>}
              {message && <p className="text-sm text-emerald-400">{message}</p>}
              <Button type="submit" className="w-full" loading={resetting}>
                {resetting ? "Đang cập nhật..." : "Đặt lại mật khẩu"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                loading={sending}
                onClick={() =>
                  requestOtp({ preventDefault() {} } as React.FormEvent)
                }
              >
                Gửi lại OTP
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-slate-400">
            <Link href="/login" className="text-violet-300 hover:underline">
              Quay lại đăng nhập
            </Link>
          </p>
        </CardContent>
      </Card>
    </MarketingShell>
  );
}
