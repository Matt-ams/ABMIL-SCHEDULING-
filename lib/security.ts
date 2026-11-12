import { createHmac, createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { PoolClient, Pool } from 'pg';
import { one, ApiError } from './db';
import { currentWorkerSession } from './auth-rules';

export function newId() { return randomUUID(); }
export function randomToken(bytes = 32) { return randomBytes(bytes).toString('base64url'); }
export function sha256(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function employeeCode() { return randomBytes(6).toString('hex').toUpperCase(); }
export function passwordHash(value: string, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(value, salt, 64).toString('hex') };
}
export function checkPassword(value: string, salt: string, hash: string) {
  const candidate = scryptSync(value, salt, 64);
  const expected = Buffer.from(hash,'hex');
  return expected.length === candidate.length && timingSafeEqual(expected,candidate);
}
export const cookieOptions = {
  name: 'abmil_session', httpOnly: true, sameSite: 'lax' as const, path: '/',
  secure: process.env.NODE_ENV === 'production', maxAge: 14*86400
};
type Claims = { role: 'admin'|'worker'; id: string; version: number; exp: number };
export function makeSession(role: Claims['role'], id: string, version = 1) {
  const secret = process.env.APP_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET_NOT_CONFIGURED');
  const body = Buffer.from(JSON.stringify({role,id,version,exp:Date.now()+14*86400000})).toString('base64url');
  const signature = createHmac('sha256',secret).update(body).digest('base64url');
  return body+'.'+signature;
}
export function readSession(request: NextRequest): Claims|null {
  const raw = request.cookies.get(cookieOptions.name)?.value;
  const secret = process.env.APP_SESSION_SECRET;
  if (!raw || !secret || secret.length < 32) return null;
  const parts = raw.split('.'); if (parts.length !== 2) return null;
  const [body,sig] = parts;
  const expected = createHmac('sha256',secret).update(body).digest();
  const actual = Buffer.from(sig,'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected,actual)) return null;
  try {
    const value = JSON.parse(Buffer.from(body,'base64url').toString('utf8')) as Claims;
    if (value.exp <= Date.now() || !['admin','worker'].includes(value.role) || !value.id || !Number.isInteger(value.version) || value.version < 1) return null;
    return value;
  } catch { return null; }
}
export async function requireActor(db: PoolClient|Pool, request: NextRequest, adminOnly = false): Promise<Claims> {
  const actor = readSession(request);
  if (!actor) throw new ApiError('Connexion nécessaire.',401);
  if (adminOnly && actor.role !== 'admin') throw new ApiError('Réservé à la direction.',403);
  if (actor.role==='admin') {
    if (actor.id!=='admin' || !(await one(db,'SELECT id FROM admin_account WHERE id=1'))) throw new ApiError('Accès invalide.',401);
  } else {
    const e=await one<{enabled:boolean;pin_hash:string|null;session_version:number}>(db,'SELECT enabled,pin_hash,session_version FROM employees WHERE id=$1',[actor.id]);
    if (!e || !currentWorkerSession(actor.version,e.session_version,e.enabled,!!e.pin_hash)) throw new ApiError('Accès expiré ou désactivé. Reconnectez-vous.',401);
  }
  return actor;
}
export function checkOrigin(request:NextRequest) {
  const origin=request.headers.get('origin');
  if (origin && origin!==new URL(request.url).origin) throw new ApiError('Origine non autorisée.',403);
  if (!(request.headers.get('content-type')||'').includes('application/json')) throw new ApiError('JSON obligatoire.',415);
}
export function ParisDate(now=new Date()) {
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
