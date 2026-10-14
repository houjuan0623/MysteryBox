const DAY = 86_400_000;
export function utcDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}
export function defaultWindow(now = new Date(), days = 7) {
  const end = utcDate(now);
  return {
    from: utcDate(Date.parse(`${end}T00:00:00.000Z`) - (days - 1) * DAY),
    to: end,
  };
}
export function windowQuery(window) {
  // 日期控件表示完整 UTC 自然日；结束时间为所选日期次日零点（不包含）。
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(window.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(window.to)
  )
    throw new Error("Choose a valid start and end date.");
  const from = new Date(`${window.from}T00:00:00.000Z`);
  const endDay = new Date(`${window.to}T00:00:00.000Z`);
  const to = new Date(+endDay + DAY);
  if (
    !Number.isFinite(+from) ||
    !Number.isFinite(+to) ||
    utcDate(from) !== window.from ||
    utcDate(endDay) !== window.to
  )
    throw new Error("Choose a valid start and end date.");
  if (from >= to)
    throw new Error("The start date must be on or before the end date.");
  if (+to - +from > 31 * DAY)
    throw new Error("Choose a window of 31 days or fewer.");
  return new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  }).toString();
}
export function formatTimestamp(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (!Number.isFinite(+date)) return "Unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hourCycle: "h23",
  }).format(date);
}
