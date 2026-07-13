import { requireUser, getConventionText } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { downloadRepositoryArchive } from "@/lib/gitlab/client";
import { findGitlabConnectionForHost } from "@/lib/gitlab/resolve-connection";
import {
  createZipFromMap,
  extractZipToMap,
  getRelevantFileContent,
  mergeFixedFiles,
} from "@/lib/source/zip";
import { fixCommentWithAi } from "@/lib/ai/providers";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  sessionId: z.string(),
  commentIds: z.array(z.string()).optional(),
  fixAllValid: z.boolean().optional(),
  providerId: z.string().optional(),
});

async function loadSourceFiles(session: {
  sourceType: string;
  zipData: Uint8Array | null;
  gitlabHost: string;
  projectId: string;
  sourceBranch: string;
  userId: string;
}) {
  if (session.sourceType === "zip" && session.zipData) {
    return extractZipToMap(Buffer.from(session.zipData));
  }

  const connection = await findGitlabConnectionForHost(
    session.userId,
    session.gitlabHost,
  );
  if (!connection) throw new Error("Không tìm thấy GitLab connection");

  const token = decrypt(connection.tokenEncrypted);
  const archive = await downloadRepositoryArchive(
    session.gitlabHost,
    token,
    session.projectId,
    session.sourceBranch,
  );
  return extractZipToMap(archive);
}

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  try {
    const body = schema.parse(await request.json());

    const session = await prisma.reviewSession.findFirst({
      where: { id: body.sessionId, userId: authResult.userId },
      include: { commentResults: true },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const targetComments = body.fixAllValid
      ? session.commentResults.filter((c) => c.verdict === "VALID")
      : session.commentResults.filter((c) => body.commentIds?.includes(c.id));

    if (targetComments.length === 0) {
      return NextResponse.json({ error: "Không có comment VALID để fix" }, { status: 400 });
    }

    let sourceFiles = await loadSourceFiles({ ...session, userId: authResult.userId });

    if (session.fixedSourceData) {
      sourceFiles = extractZipToMap(Buffer.from(session.fixedSourceData));
    }

    const conventions = await getConventionText(
      authResult.userId,
      session.selectedCategoryIds,
    );

    const providerId = body.providerId ?? session.aiProviderId ?? undefined;

    const allValidSummary = targetComments.map((c) => c.body).join("\n---\n");
    const updatedResults = [];

    for (const comment of targetComments) {
      const fileContent = comment.filePath
        ? getRelevantFileContent(sourceFiles, comment.filePath, comment.line)
        : "";

      const { result } = await fixCommentWithAi({
        userId: authResult.userId,
        providerId,
        conventions,
        commentBody: comment.body,
        filePath: comment.filePath,
        fileContent,
        allValidComments: body.fixAllValid ? allValidSummary : undefined,
      });

      sourceFiles = mergeFixedFiles(sourceFiles, result.fixedFiles);

      const updated = await prisma.commentValidationResult.update({
        where: { id: comment.id },
        data: {
          suggestedReply: result.reply,
          fixedFilesJson: JSON.stringify(result.fixedFiles),
        },
      });
      updatedResults.push({ ...updated, fixSummary: result.summary });
    }

    const fixedZip = createZipFromMap(sourceFiles);
    await prisma.reviewSession.update({
      where: { id: session.id },
      data: { fixedSourceData: Uint8Array.from(fixedZip) },
    });

    return NextResponse.json({
      sessionId: session.id,
      fixedCount: updatedResults.length,
      results: updatedResults,
      downloadReady: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fix thất bại";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
