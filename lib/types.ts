export type Role = 'admin' | 'worker';
export type Employee = {
  id: string; name: string; role: string; code: string; enabled: boolean; activated?: boolean;
};
export type Site = {
  id: string; name: string; city: string; client: string; start: string; end: string;
  breakMinutes: number; active: boolean;
};
export type Assignment = {
  id: string; workerId: string; siteId: string; date: string;
  start: string; end: string; note: string;
};
export type WorkBreak = { id: string; startAt: string; endAt?: string };
export type Punch = {
  id: string; workerId: string; siteId: string; assignmentId: string;
  workDate: string; inAt: string; outAt?: string;
  breaks: WorkBreak[]; breakMinutes: number;
  status: 'working'|'paused'|'completed'; netMinutes?: number;
  approved: boolean; voided?: boolean; correctionReason?: string;
};
export type Absence = {
  id: string; workerId: string; from: string; to: string;
  reason: string; status: 'pending'|'approved'|'rejected';
};
export type Audit = { id: string; at: string; actor: string; action: string; details: string };
export type ClientState = { employees: Employee[]; sites: Site[]; assignments: Assignment[]; punches: Punch[]; absences: Absence[]; audit?: Audit[] };
