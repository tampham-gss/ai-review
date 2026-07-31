import { after } from "next/server";
import { NextResponse } from "next/server";
import {
  executeAcceptedWebhookValidate,
  handleGitlabNoteWebhook,
  parseGitlabNoteWebhook,
} from "@/lib/webhooks/gitlab-auto-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GitLab webhook (Note events).
 * Cấu hình URL: {APP_URL}/api/webhooks/gitlab
 * Secret token = secret trong Settings → Webhook (header X-Gitlab-Token).
 * Trigger khi comment trên MR khớp đúng triggerPhrase (mặc định: Agent reject review).
 */
export async function POST(request: Request) {
  const secret =
    request.headers.get("x-gitlab-token")?.trim() ||
    new URL(request.url).searchParams.get("token")?.trim() ||
    "";

  if (!secret) {
    return NextResponse.json(
      { error: "Missing X-Gitlab-Token" },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = parseGitlabNoteWebhook(raw);
  if (!payload) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const result = await handleGitlabNoteWebhook(secret, payload);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  if (result.ignored || !("accepted" in result) || !result.accepted) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: "reason" in result ? result.reason : "Ignored",
      sessionId: "sessionId" in result ? result.sessionId : undefined,
    });
  }

  const job = {
    userId: result.userId,
    configId: result.configId,
    body: result.body,
  };

  // Chạy validate nền sau khi trả 200 cho GitLab
  after(async () => {
    try {
      await executeAcceptedWebhookValidate(job);
    } catch (error) {
      console.error("[webhook/gitlab] auto validate failed:", error);
    }
  });

  return NextResponse.json({
    ok: true,
    accepted: true,
    message: "Auto validate queued",
    projectPath: job.body.projectPath,
    mrIid: job.body.mrIid,
  });
}
