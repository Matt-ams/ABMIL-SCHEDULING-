/** Pure duration helpers shared by the API and the interface tests. */
export function intervalSeconds(start: string | Date, end: string | Date): number {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) throw new Error('Intervalle de temps invalide');
  return Math.floor((b - a) / 1000);
}
export function sessionMinutes(
  start: string | Date,
  end: string | Date,
  pauses: Array<{startAt: string | Date; endAt?: string | Date | null}>,
  correction: number | null = null
): {grossMinutes: number; breakMinutes: number; netMinutes: number} {
  const grossSeconds = intervalSeconds(start, end);
  let pausedSeconds = 0;
  if (correction !== null) {
    if (!Number.isInteger(correction) || correction < 0) throw new Error('Correction de pause invalide');
    pausedSeconds = correction * 60;
  } else {
    const ordered = pauses.slice().sort((a,b)=>new Date(a.startAt).getTime()-new Date(b.startAt).getTime());
    let lastEnd = new Date(start).getTime();
    for (const pause of ordered) {
      const a = new Date(pause.startAt).getTime();
      const b = new Date(pause.endAt ?? end).getTime();
      if (a < lastEnd || b > new Date(end).getTime() || b < a) throw new Error('Pauses incohérentes');
      pausedSeconds += intervalSeconds(new Date(a), new Date(b));
      lastEnd = b;
    }
  }
  if (pausedSeconds > grossSeconds) throw new Error('Pause supérieure à la présence');
  const grossMinutes = Math.round(grossSeconds / 60);
  const breakMinutes = Math.round(pausedSeconds / 60);
  const netMinutes = Math.round((grossSeconds - pausedSeconds) / 60);
  return {grossMinutes,breakMinutes,netMinutes};
}
export function validDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v+'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===v;
}
export function validTime(v: unknown): v is string { return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v); }
export function asMinutes(v:string) { return Number(v.slice(0,2))*60+Number(v.slice(3,5)); }
