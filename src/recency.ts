const MS_PER_HOUR = 60 * 60 * 1000;

export function recencyHoursFromMtime(mtime: number | null | undefined, now = Date.now()): number | null {
  if (typeof mtime !== "number" || !Number.isFinite(mtime)) return null;
  return round(Math.max(0, (now - mtime) / MS_PER_HOUR), 3);
}

export function freshnessFromMtime(mtime: number | null | undefined, windowHours: number, now = Date.now()): number {
  const ageHours = recencyHoursFromMtime(mtime, now);
  if (ageHours == null || windowHours <= 0) return 0;
  return round(Math.max(0, Math.min(1, 1 - ageHours / windowHours)), 3);
}

export function formatRecency(hours: number | null): string {
  if (hours == null) return "mtime unknown";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 48) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
