/** Cells safe to open in Excel or other spreadsheet software. */
export function csvCell(value: unknown): string {
  let s = String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
  // Prefix dangerous first characters to prevent CSV formula injection.
  if (/^[\s]*[=+@\-\t]/.test(s)) s = "'" + s;
  return '"' + s + '"';
}

export function csvRows(rows: Array<Array<string | number>>): string {
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}

/** French accountant-friendly decimal hours, based on complete minutes. */
export function csvHours(netMinutes: number): string {
  if (!Number.isFinite(netMinutes) || netMinutes < 0) throw new Error('Minutes invalides');
  return (netMinutes / 60).toFixed(2).replace('.', ',');
}
