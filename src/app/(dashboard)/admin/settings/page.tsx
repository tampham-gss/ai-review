"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { PageSkeleton } from "@/components/ui/skeleton";

type Settings = {
  registrationOpen: boolean;
  maintenanceMode: boolean;
  announcement: string | null;
  defaultMonthlyTokenQuota: number | null;
  retentionDays: number;
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings));
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi");
      setSettings(data.settings);
      toast.success("Đã lưu cấu hình");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function runRetention() {
    if (!confirm("Xóa các session cũ hơn retentionDays?")) return;
    const res = await fetch("/api/admin/retention", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Retention thất bại");
      return;
    }
    toast.success(`Đã xóa ${data.deleted} session`);
  }

  if (!settings) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hệ thống</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.registrationOpen}
              onChange={(e) =>
                setSettings({ ...settings, registrationOpen: e.target.checked })
              }
            />
            Cho phép đăng ký mới
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.maintenanceMode}
              onChange={(e) =>
                setSettings({ ...settings, maintenanceMode: e.target.checked })
              }
            />
            Chế độ bảo trì (user thường bị chặn validate/push)
          </label>
          <div>
            <p className="mb-1 text-muted">Announcement banner</p>
            <Textarea
              value={settings.announcement ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  announcement: e.target.value || null,
                })
              }
              placeholder="Thông báo hiện trên dashboard..."
            />
          </div>
          <div>
            <p className="mb-1 text-muted">Quota token mặc định / tháng (trống = không giới hạn)</p>
            <Input
              type="number"
              value={settings.defaultMonthlyTokenQuota ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultMonthlyTokenQuota: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </div>
          <div>
            <p className="mb-1 text-muted">Retention (ngày)</p>
            <Input
              type="number"
              value={settings.retentionDays}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  retentionDays: Number(e.target.value) || 90,
                })
              }
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} loading={saving}>
              Lưu cấu hình
            </Button>
            <Button variant="outline" onClick={() => void runRetention()}>
              Chạy retention ngay
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
