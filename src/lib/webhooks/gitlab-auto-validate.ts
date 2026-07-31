import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { normalizeGitlabHost } from "@/lib/utils";
import {
  runValidateJob,
  type ValidateBody,
  type ValidateProgressEvent,
} from "@/lib/reviews/validate-runner";
import { getAccessibleGitlabConnection } from "@/lib/shares";
import { assertUserCanOperate } from "@/lib/api-helpers";
import { randomBytes } from "crypto";

export const DEFAULT_TRIGGER_PHRASE = "Agent reject review";

export function generateWebhookSecret() {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

/** Comment khớp đúng lệnh trigger (trim, giữ nguyên hoa/thường). */
export function matchesTriggerPhrase(note: string, phrase: string) {
  return note.trim() === phrase.trim();
}

export type GitlabNoteWebhookPayload = {
  object_kind?: string;
  event_type?: string;
  project_id?: number;
  project?: {
    id?: number;
    web_url?: string;
    path_with_namespace?: string;
    http_url?: string;
  };
  object_attributes?: {
    id?: number;
    note?: string;
    noteable_type?: string;
    system?: boolean;
  };
  merge_request?: {
    id?: number;
    iid?: number;
    title?: string;
    source_branch?: string;
    target_branch?: string;
    state?: string;
    web_url?: string;
  };
};

export function parseGitlabNoteWebhook(
  raw: unknown,
): GitlabNoteWebhookPayload | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as GitlabNoteWebhookPayload;
}

export function isMergeRequestNoteEvent(payload: GitlabNoteWebhookPayload) {
  const kind = payload.object_kind ?? payload.event_type;
  if (kind !== "note") return false;
  const attrs = payload.object_attributes;
  if (!attrs || attrs.system) return false;
  return attrs.noteable_type === "MergeRequest" && !!payload.merge_request;
}

function hostFromProjectUrl(webUrl?: string): string | null {
  if (!webUrl) return null;
  try {
    const u = new URL(webUrl);
    return normalizeGitlabHost(`${u.protocol}//${u.host}`);
  } catch {
    return null;
  }
}

/** Chạy validate + auto-continue các batch (cho webhook nền). */
export async function runValidateUntilDone(
  userId: string,
  initialBody: ValidateBody,
  onEvent?: (event: ValidateProgressEvent) => void,
  maxRounds = 40,
) {
  let body: ValidateBody = initialBody;
  let lastSessionId = "";

  for (let round = 0; round < maxRounds; round++) {
    let needContinue = false;
    let sessionId = lastSessionId;

    await runValidateJob(userId, body, (event) => {
      onEvent?.(event);
      if (event.type === "need_continue") {
        needContinue = true;
        sessionId = event.sessionId;
      }
      if (event.type === "complete") {
        sessionId = event.sessionId;
      }
    });

    lastSessionId = sessionId || lastSessionId;
    if (!needContinue || !sessionId) break;
    body = { sessionId };
  }

  return lastSessionId;
}

export async function handleGitlabNoteWebhook(
  secret: string,
  payload: GitlabNoteWebhookPayload,
) {
  const config = await prisma.webhookAutoValidate.findUnique({
    where: { secret },
  });
  if (!config || !config.isEnabled) {
    return { ok: false as const, status: 401, error: "Invalid webhook token" };
  }

  if (!isMergeRequestNoteEvent(payload)) {
    return {
      ok: true as const,
      ignored: true,
      reason: "Not a merge request note event",
    };
  }

  const note = payload.object_attributes?.note ?? "";
  if (!matchesTriggerPhrase(note, config.triggerPhrase)) {
    return {
      ok: true as const,
      ignored: true,
      reason: "Note does not match trigger phrase",
    };
  }

  const mr = payload.merge_request!;
  if (!mr.iid || !mr.source_branch) {
    return {
      ok: false as const,
      status: 400,
      error: "Missing merge request iid/source_branch",
    };
  }

  const projectId = String(
    payload.project?.id ?? payload.project_id ?? "",
  );
  const projectPath =
    payload.project?.path_with_namespace?.trim() ||
    `project/${projectId}`;

  if (!projectId) {
    return { ok: false as const, status: 400, error: "Missing project id" };
  }

  const user = await prisma.user.findUnique({
    where: { id: config.userId },
    select: { id: true, role: true, isDisabled: true },
  });
  if (!user || user.isDisabled) {
    return { ok: false as const, status: 403, error: "User disabled" };
  }

  const role = user.role === "admin" ? "admin" : "user";
  const blocked = await assertUserCanOperate(user.id, role);
  if (blocked) {
    const errBody = await blocked.json().catch(() => ({}));
    return {
      ok: false as const,
      status: blocked.status,
      error:
        typeof errBody.error === "string"
          ? errBody.error
          : "User cannot operate",
    };
  }

  const connection = await getAccessibleGitlabConnection(
    config.userId,
    config.connectionId,
  );
  if (!connection) {
    await prisma.webhookAutoValidate.update({
      where: { id: config.id },
      data: { lastError: "GitLab connection not found" },
    });
    return {
      ok: false as const,
      status: 400,
      error: "GitLab connection not found",
    };
  }

  const payloadHost = hostFromProjectUrl(
    payload.project?.web_url ?? payload.project?.http_url,
  );
  if (payloadHost && payloadHost !== normalizeGitlabHost(connection.host)) {
    return {
      ok: false as const,
      status: 400,
      error: `Host mismatch: webhook ${payloadHost} vs connection ${connection.host}`,
    };
  }

  // Tránh spam: đang validating cùng MR trong 3 phút gần đây
  const recent = await prisma.reviewSession.findFirst({
    where: {
      userId: config.userId,
      projectId,
      mrIid: mr.iid,
      status: "validating",
      updatedAt: { gte: new Date(Date.now() - 3 * 60_000) },
    },
    select: { id: true },
  });
  if (recent) {
    return {
      ok: true as const,
      ignored: true,
      reason: "Validate already running for this MR",
      sessionId: recent.id,
    };
  }

  // Verify token still works (light touch — decrypt only)
  try {
    decrypt(connection.tokenEncrypted);
  } catch {
    return { ok: false as const, status: 400, error: "Invalid connection token" };
  }

  const body: ValidateBody = {
    connectionId: connection.id,
    projectId,
    projectPath,
    mrIid: mr.iid,
    mrTitle: mr.title ?? undefined,
    sourceBranch: mr.source_branch,
    selectedCategoryIds: config.selectedCategoryIds,
    sourceType: "gitlab",
    providerId: config.aiProviderId ?? undefined,
  };

  await prisma.webhookAutoValidate.update({
    where: { id: config.id },
    data: {
      lastTriggeredAt: new Date(),
      lastError: null,
    },
  });

  return {
    ok: true as const,
    ignored: false,
    accepted: true,
    userId: config.userId,
    configId: config.id,
    body,
    mrWebUrl: mr.web_url,
  };
}

export async function executeAcceptedWebhookValidate(params: {
  userId: string;
  configId: string;
  body: ValidateBody;
}) {
  try {
    const sessionId = await runValidateUntilDone(params.userId, params.body);
    await prisma.webhookAutoValidate.update({
      where: { id: params.configId },
      data: {
        lastSessionId: sessionId || null,
        lastError: null,
      },
    });
    return { sessionId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Auto validate failed";
    await prisma.webhookAutoValidate.update({
      where: { id: params.configId },
      data: { lastError: message },
    });
    throw error;
  }
}
