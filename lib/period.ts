import { validDate } from './time.ts';

export type ReportPeriod = 'week' | 'month';

/** UTC date arithmetic avoids DST drift when grouping French civil dates. */
export function reportBounds(period: ReportPeriod, date: string): {start:string;end:string} {
  if (!validDate(date)) throw new Error('Date de rapport invalide');
  const d = new Date(date + 'T12:00:00Z');
  const day = (v: Date) => v.toISOString().slice(0, 10);
  if (period === 'week') {
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const start = day(d);
    d.setUTCDate(d.getUTCDate() + 6);
    return {start, end: day(d)};
  }
  const start = date.slice(0, 7) + '-01';
  const first = new Date(start + 'T12:00:00Z');
  first.setUTCMonth(first.getUTCMonth() + 1);
  first.setUTCDate(0);
  return {start, end: day(first)};
}
