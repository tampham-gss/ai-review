export type StatsRange = "day" | "week" | "month";

export function getRangeBounds(range: StatsRange, now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);

  if (range === "day") {
    start.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1; // Monday start
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }

  return { start, end };
}

export function buildBuckets(range: StatsRange, start: Date, end: Date) {
  const buckets: Array<{ key: string; label: string; start: Date; end: Date }> = [];

  if (range === "day") {
    for (let h = 0; h < 24; h++) {
      const bucketStart = new Date(start);
      bucketStart.setHours(h, 0, 0, 0);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setHours(h + 1, 0, 0, 0);
      buckets.push({
        key: `${h}`,
        label: `${String(h).padStart(2, "0")}h`,
        start: bucketStart,
        end: bucketEnd,
      });
    }
  } else if (range === "week") {
    const labels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
    for (let i = 0; i < 7; i++) {
      const bucketStart = new Date(start);
      bucketStart.setDate(start.getDate() + i);
      bucketStart.setHours(0, 0, 0, 0);
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketStart.getDate() + 1);
      buckets.push({
        key: `${i}`,
        label: labels[i],
        start: bucketStart,
        end: bucketEnd,
      });
    }
  } else {
    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const bucketStart = new Date(start.getFullYear(), start.getMonth(), d, 0, 0, 0, 0);
      const bucketEnd = new Date(start.getFullYear(), start.getMonth(), d + 1, 0, 0, 0, 0);
      if (bucketStart > end) break;
      buckets.push({
        key: `${d}`,
        label: String(d),
        start: bucketStart,
        end: bucketEnd,
      });
    }
  }

  return buckets;
}

export function rangeLabel(range: StatsRange) {
  switch (range) {
    case "day":
      return "Hôm nay";
    case "week":
      return "Tuần này";
    case "month":
      return "Tháng này";
  }
}
