import { requireUser } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import {
  getRangeBounds,
  rangeLabel,
  type StatsRange,
} from "@/lib/stats";
import { NextResponse } from "next/server";

type QualityRow = {
  key: string;
  label: string;
  total: number;
  valid: number;
  invalid: number;
  partial: number;
  other: number;
  invalidRate: number;
  validRate: number;
  avgConfidence: number | null;
  pushed: number;
};

function emptyRow(key: string, label: string): QualityRow {
  return {
    key,
    label,
    total: 0,
    valid: 0,
    invalid: 0,
    partial: 0,
    other: 0,
    invalidRate: 0,
    validRate: 0,
    avgConfidence: null,
    pushed: 0,
  };
}

function finalize(row: QualityRow, confidences: number[]): QualityRow {
  if (row.total > 0) {
    row.invalidRate = Math.round((row.invalid / row.total) * 1000) / 10;
    row.validRate = Math.round((row.valid / row.total) * 1000) / 10;
  }
  if (confidences.length > 0) {
    row.avgConfidence =
      Math.round(
        (confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100,
      ) / 100;
  }
  return row;
}

function weekKey(d: Date) {
  const start = new Date(d);
  const day = start.getDay();
  const diff = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const dd = String(start.getDate()).padStart(2, "0");
  return {
    key: `${y}-${m}-${dd}`,
    label: `Tuần ${dd}/${m}`,
    start,
  };
}

/** Báo cáo chất lượng: theo project, reviewer (author), tuần. */
export async function GET(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const rangeParam = searchParams.get("range") ?? "month";
  const range: StatsRange =
    rangeParam === "day" || rangeParam === "week" || rangeParam === "month"
      ? rangeParam
      : "month";

  // Quality báo cáo mặc định rộng hơn: month; cho phép week/day
  const { start, end } =
    range === "day" || range === "week" || range === "month"
      ? getRangeBounds(range)
      : getRangeBounds("month");

  // Với quality “theo tuần”, lấy 8 tuần gần nhất nếu range=month không đủ
  const qualityStart =
    range === "month"
      ? (() => {
          const s = new Date();
          s.setDate(s.getDate() - 56);
          s.setHours(0, 0, 0, 0);
          return s;
        })()
      : start;

  const comments = await prisma.commentValidationResult.findMany({
    where: {
      session: { userId: authResult.userId },
      createdAt: { gte: qualityStart, lte: end },
    },
    select: {
      verdict: true,
      confidence: true,
      author: true,
      pushedToGitlab: true,
      createdAt: true,
      session: { select: { projectPath: true } },
    },
  });

  const byProject = new Map<string, { row: QualityRow; conf: number[] }>();
  const byReviewer = new Map<string, { row: QualityRow; conf: number[] }>();
  const byWeek = new Map<string, { row: QualityRow; conf: number[] }>();

  function bump(
    map: Map<string, { row: QualityRow; conf: number[] }>,
    key: string,
    label: string,
    verdict: string | null,
    confidence: number | null,
    pushed: boolean,
  ) {
    let entry = map.get(key);
    if (!entry) {
      entry = { row: emptyRow(key, label), conf: [] };
      map.set(key, entry);
    }
    entry.row.total += 1;
    if (verdict === "VALID") entry.row.valid += 1;
    else if (verdict === "INVALID") entry.row.invalid += 1;
    else if (verdict === "PARTIAL") entry.row.partial += 1;
    else entry.row.other += 1;
    if (pushed) entry.row.pushed += 1;
    if (typeof confidence === "number") entry.conf.push(confidence);
  }

  for (const c of comments) {
    const project = c.session.projectPath || "unknown";
    bump(byProject, project, project, c.verdict, c.confidence, c.pushedToGitlab);

    const reviewer = (c.author || "Unknown").trim() || "Unknown";
    bump(byReviewer, reviewer, reviewer, c.verdict, c.confidence, c.pushedToGitlab);

    const wk = weekKey(c.createdAt);
    bump(byWeek, wk.key, wk.label, c.verdict, c.confidence, c.pushedToGitlab);
  }

  const sortByTotal = (a: QualityRow, b: QualityRow) => b.total - a.total;

  return NextResponse.json({
    range,
    rangeLabel: rangeLabel(range),
    start: qualityStart.toISOString(),
    end: end.toISOString(),
    summary: {
      comments: comments.length,
      valid: comments.filter((c) => c.verdict === "VALID").length,
      invalid: comments.filter((c) => c.verdict === "INVALID").length,
      partial: comments.filter((c) => c.verdict === "PARTIAL").length,
      invalidRate:
        comments.length > 0
          ? Math.round(
              (comments.filter((c) => c.verdict === "INVALID").length /
                comments.length) *
                1000,
            ) / 10
          : 0,
    },
    byProject: [...byProject.values()]
      .map((e) => finalize(e.row, e.conf))
      .sort(sortByTotal)
      .slice(0, 20),
    byReviewer: [...byReviewer.values()]
      .map((e) => finalize(e.row, e.conf))
      .sort(sortByTotal)
      .slice(0, 20),
    byWeek: [...byWeek.values()]
      .map((e) => finalize(e.row, e.conf))
      .sort((a, b) => a.key.localeCompare(b.key)),
  });
}
