import { getSystemSettings } from "@/lib/admin";
import { NextResponse } from "next/server";

/** Public nhẹ — announcement / bảo trì / đăng ký mở (không lộ secret). */
export async function GET() {
  const settings = await getSystemSettings();
  return NextResponse.json({
    registrationOpen: settings.registrationOpen,
    maintenanceMode: settings.maintenanceMode,
    announcement: settings.announcement,
  });
}
