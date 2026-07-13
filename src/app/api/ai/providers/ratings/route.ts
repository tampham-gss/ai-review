import { requireUser } from "@/lib/api-helpers";
import { getProviderRatingsForUser } from "@/lib/ai/provider-ratings";
import { getRangeBounds, type StatsRange } from "@/lib/stats";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const rangeParam = searchParams.get("range");
  const lifetime = searchParams.get("lifetime") === "1" || !rangeParam;

  let since: Date | undefined;
  if (!lifetime && rangeParam) {
    const range: StatsRange =
      rangeParam === "day" || rangeParam === "month" ? rangeParam : "week";
    since = getRangeBounds(range).start;
  }

  const ratings = await getProviderRatingsForUser(authResult.userId, { since });
  const best = ratings[0] ?? null;

  return NextResponse.json({
    lifetime,
    ratings,
    best,
    legend: [
      { stars: 5, label: "Rất mạnh" },
      { stars: 4, label: "Mạnh" },
      { stars: 3, label: "Khá" },
      { stars: 2, label: "Cơ bản" },
      { stars: 1, label: "Yếu" },
    ],
  });
}
