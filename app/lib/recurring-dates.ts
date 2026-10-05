export const RECURRENCE_FREQUENCIES = ["Weekly", "Biweekly", "Monthly", "Quarterly", "SemiAnnually", "Annually"] as const;
export type RecurringFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateRecurringSchedule(startDate: unknown, endDate: unknown, frequency: unknown): void {
  if (!isCalendarDate(startDate)) throw new Error("Enter a valid expected start date for recurring work");
  if (!isCalendarDate(endDate)) throw new Error("Enter a valid expected end date for recurring work");
  if (endDate < startDate) throw new Error("Expected end date can't be before the expected start date");
  if (!RECURRENCE_FREQUENCIES.some((candidate) => candidate === frequency)) {
    throw new Error("Choose a valid recurrence frequency");
  }
}

export function getRecurringDates(
  startDate: string,
  endDate: string,
  frequency: RecurringFrequency,
  rangeStart = startDate,
  rangeEnd = endDate,
): string[] {
  validateRecurringSchedule(startDate, endDate, frequency);
  if (!isCalendarDate(rangeStart) || !isCalendarDate(rangeEnd) || rangeEnd < rangeStart) {
    throw new Error("Choose a valid recurrence date range");
  }
  const first = rangeStart > startDate ? rangeStart : startDate;
  const last = rangeEnd < endDate ? rangeEnd : endDate;
  if (first > last) return [];
  const anchor = new Date(`${startDate}T00:00:00.000Z`);
  const dates: string[] = [];
  if (frequency === "Weekly" || frequency === "Biweekly") {
    const interval = (frequency === "Weekly" ? 7 : 14) * 86_400_000;
    const offset = Math.ceil((Date.parse(`${first}T00:00:00.000Z`) - anchor.getTime()) / interval);
    for (let time = anchor.getTime() + offset * interval; time <= Date.parse(`${last}T00:00:00.000Z`); time += interval) {
      dates.push(new Date(time).toISOString().slice(0, 10));
    }
    return dates;
  }
  const months = { Monthly: 1, Quarterly: 3, SemiAnnually: 6, Annually: 12 }[frequency];
  const firstDate = new Date(`${first}T00:00:00.000Z`);
  const monthOffset = (firstDate.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + firstDate.getUTCMonth() - anchor.getUTCMonth();
  for (let index = Math.floor(monthOffset / months); ; index++) {
    // Always use the original day, so February's clamp does not shift later visits.
    const date = new Date(anchor);
    date.setUTCDate(1);
    date.setUTCMonth(anchor.getUTCMonth() + index * months);
    if (date.getUTCFullYear() > 9999) break;
    const nextMonth = new Date(date);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    nextMonth.setUTCDate(0);
    date.setUTCDate(Math.min(anchor.getUTCDate(), nextMonth.getUTCDate()));
    const value = date.toISOString().slice(0, 10);
    if (value > last) break;
    if (value >= first) dates.push(value);
  }
  return dates;
}
