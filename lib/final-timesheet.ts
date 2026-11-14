import { csvHours, csvRows } from './csv.ts';

export type FinalTimesheetRecord = { employee: string; site: string; day: string; netMinutes: number };

const weekdayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function weekStart(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return isoDay(date);
}

function isoWeek(day: string): number {
  const date = new Date(`${weekStart(day)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7));
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

function weekEnd(start: string): string {
  const date = new Date(`${start}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return isoDay(date);
}

function frDate(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}

/** Monthly printable/accountant-facing layout. Input records must already be approved. */
export function finalTimesheetRows(records: FinalTimesheetRecord[], month: string, client: string) {
  const groups = new Map<string, { employee: string; site: string; start: string; daily: number[] }>();
  for (const record of records) {
    const start = weekStart(record.day);
    const key = `${record.employee}\u0000${record.site}\u0000${start}`;
    const item = groups.get(key) || { employee: record.employee, site: record.site, start, daily: Array(7).fill(0) };
    const date = new Date(`${record.day}T12:00:00Z`);
    item.daily[(date.getUTCDay() + 6) % 7] += record.netMinutes;
    groups.set(key, item);
  }

  const detail = Array.from(groups.values()).sort((a, b) => a.employee.localeCompare(b.employee, 'fr') || a.start.localeCompare(b.start) || a.site.localeCompare(b.site, 'fr'));
  const [year, monthNumber] = month.split('-');
  const lastDay = new Date(Date.UTC(Number(year), Number(monthNumber), 0)).getUTCDate();
  const rows: Array<Array<string | number>> = [
    ['ABMIL POSE — FEUILLE FINALE DE POINTAGE'],
    ['Mois', `${monthNumber}/${year}`, 'Client', client, 'Période couverte', `01/${monthNumber}/${year} - ${lastDay}/${monthNumber}/${year}`],
    ['Pointages terminés et validés par la direction uniquement. Heures nettes au format décimal français.'],
    ['Salarié', 'Chantier', 'Semaine N°', 'Du', 'Au', ...weekdayNames, 'Total semaine'],
    ...detail.map(item => [item.employee, item.site, String(isoWeek(item.start)), frDate(item.start), frDate(weekEnd(item.start)), ...item.daily.map(csvHours), csvHours(item.daily.reduce((sum, value) => sum + value, 0))]),
    [],
    ['RÉCAPITULATIF MENSUEL PAR SALARIÉ'],
    ['Salarié', 'Jours pointés', 'Heures nettes'],
  ];

  const totals = new Map<string, { days: Set<string>; minutes: number }>();
  for (const record of records) {
    const item = totals.get(record.employee) || { days: new Set<string>(), minutes: 0 };
    item.days.add(record.day);
    item.minutes += record.netMinutes;
    totals.set(record.employee, item);
  }
  for (const [employee, total] of [...totals.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'))) {
    rows.push([employee, total.days.size, csvHours(total.minutes)]);
  }
  rows.push(['TOTAL GÉNÉRAL', '', csvHours(records.reduce((sum, record) => sum + record.netMinutes, 0))]);
  rows.push([], ['Visa salarié : ______________________________', '', 'Visa direction : ______________________________']);
  return csvRows(rows);
}
