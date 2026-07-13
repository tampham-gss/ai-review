"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { KeyRound } from "lucide-react";

type Mode = "current" | "otp";

export default function ChangePasswordPage() {
  const { data: session } = useSession();
  const [mode, setMode] = useState<Mode>("current");
  const [currentPassword, setCurrentPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [saving, setSaving] = useState(false);

  async function requestOtp() {
    setSendingOtp(true);
    setDevOtp("");
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request-otp" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Gửi OTP thất bại");
        return;
      }
      toast.success(data.message ?? "Đã gửi OTP");
      if (data.devOtp) setDevOtp(data.devOtp);
      setMode("otp");
    } catch {
      toast.error("Lỗi kết nối khi gửi OTP");
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Mật khẩu xác nhận không khớp");
      return;
    }

    setSaving(true);
    try {
      const payload =
        mode === "current"
          ? {
              mode: "current" as const,
              currentPassword,
              newPassword,
            }
          : {
              mode: "otp" as const,
              otp,
              newPassword,
            };

      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Đổi mật khẩu thất bại");
        return;
      }
      toast.success(data.message ?? "Đã đổi mật khẩu");
      setCurrentPassword("");
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setDevOtp("");
    } catch {
      toast.error("Lỗi kết nối khi đổi mật khẩu");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-white">
          <KeyRound className="h-7 w-7 text-violet-400" />
          Đổi mật khẩu
        </h1>
        <p className="mt-1 text-slate-400">
          Đổi bằng mật khẩu hiện tại, hoặc nhận OTP qua email{" "}
          <span className="text-slate-300">{session?.user?.email}</span>.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Cập nhật mật khẩu</CardTitle>
          <CardDescription>
            Tài khoản OAuth chưa có mật khẩu nên dùng OTP để đặt mật khẩu lần đầu.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={mode === "current" ? "default" : "secondary"}
              onClick={() => setMode("current")}
            >
              Mật khẩu hiện tại
            </Button>
            <Button
              size="sm"
              variant={mode === "otp" ? "default" : "secondary"}
              onClick={() => setMode("otp")}
            >
              OTP qua email
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "current" ? (
              <Input
                type="password"
                placeholder="Mật khẩu hiện tại"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Input
                    placeholder="Mã OTP 6 số"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    required
                    inputMode="numeric"
                    maxLength={8}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    loading={sendingOtp}
                    onClick={requestOtp}
                  >
                    {sendingOtp ? "Đang gửi..." : "Gửi OTP"}
                  </Button>
                </div>
                {devOtp && (
                  <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    Dev OTP: <span className="font-mono font-bold">{devOtp}</span>
                  </p>
                )}
              </>
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
            <Button type="submit" loading={saving}>
              {saving ? "Đang lưu..." : "Cập nhật mật khẩu"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
