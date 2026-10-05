export type WeekRange = { startDate: string; endDate: string };

export function getCurrentWeekRange(date: Date): WeekRange {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return { startDate: monday.toISOString().slice(0, 10), endDate: sunday.toISOString().slice(0, 10) };
}

export function getEstimatedLaborHours(
  lines: Array<{ lineType: string; unitName: string | null; quantity: number }>,
) {
  return lines.reduce((total, line) => (
    line.lineType === "Labor" && line.unitName?.trim().toUpperCase() === "HR"
      ? total + line.quantity
      : total
  ), 0);
}
