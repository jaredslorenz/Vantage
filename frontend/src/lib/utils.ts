function dateGroupLabel(ts: number | string): string {
  const d = new Date(typeof ts === "number" ? ts : ts);
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function timeAgo(val: number | string): string {
  const ms = typeof val === "number" ? val : new Date(val).getTime();
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function groupByDate<T extends { created_at: number | string }>(items: T[]): { label: string; items: T[] }[] {
  const result: { label: string; items: T[] }[] = [];
  const seen = new Map<string, T[]>();
  for (const item of items) {
    const label = dateGroupLabel(item.created_at);
    if (!seen.has(label)) { seen.set(label, []); result.push({ label, items: seen.get(label)! }); }
    seen.get(label)!.push(item);
  }
  return result;
}
