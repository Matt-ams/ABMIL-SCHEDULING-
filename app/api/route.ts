import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { database, transaction, one, ApiError, isConfigured } from '@/lib/db';
import { newId, randomToken, sha256, employeeCode, passwordHash, checkPassword, cookieOptions, makeSession, readSession, requireActor, checkOrigin, ParisDate } from '@/lib/security';
import { validDate, validTime, asMinutes, sessionMinutes } from '@/lib/time';
import { transition, type ClockAction, type ClockStatus } from '@/lib/clock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (o:unknown,status=200) => NextResponse.json(o,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const value = (v:unknown,max=120) => typeof v==='string'?v.trim().slice(0,max):'';
const required = (v:unknown,message:string) => { if (!v) throw new ApiError(message); };
const positive = (v:unknown, min:number, max:number) => typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const iso = (v:unknown) => new Date(v as string).toISOString();
const dateField = (v:unknown) => { if (!validDate(v)) throw new ApiError('Date invalide.'); return v; };
const timeField = (v:unknown) => { if (!validTime(v)) throw new ApiError('Heure invalide.'); return v; };
const nowDate = () => ParisDate(new Date());
const trustedMessage = (e:unknown) => e instanceof ApiError ? e.message : 'Une erreur de service est survenue. Réessayez.';
const handle = (e:unknown) => {
  if (!(e instanceof ApiError)) console.error('ABMIL API error',e instanceof Error?e.message:'unknown');
  return json({error:trustedMessage(e)},e instanceof ApiError?e.status:503);
};
const authenticateResponse = (role:'admin'|'worker',id:string,version=1) => {
  const result=json({ok:true});
  result.cookies.set({...cookieOptions,value:makeSession(role,id,version)});
  return result;
};
const storeAudit = async (db:PoolClient,actor:string,action:string,details:string,previous:unknown=null,next:unknown=null) => {
  await db.query('INSERT INTO audit_log(id,actor,action,details,previous,next) VALUES($1,$2,$3,$4,$5,$6)',[newId(),actor,action,details,JSON.stringify(previous),JSON.stringify(next)]);
};

type SessionRow = {
  id:string; worker_id:string; site_id:string; assignment_id:string; work_date:string;
  start_at:Date; end_at:Date|null; corrected_break_minutes:number|null; approved:boolean; voided:boolean; correction_reason:string|null;
};
function strictDuration(inAt:string,outAt:string,breakMins:number) {
  if (!Number.isInteger(breakMins)||breakMins<0||breakMins>1440) throw new ApiError('Durée de pause invalide.');
  const result=sessionMinutes(inAt,outAt,[],breakMins);
  if (result.netMinutes<0) throw new ApiError('Pause supérieure à la durée de présence.');
}
async function getState(db:PoolClient|ReturnType<typeof database>,actor:{role:'admin'|'worker';id:string}) {
  const admin=actor.role==='admin';
  const where=admin?'':' WHERE id=$1'; const params=admin?[]:[actor.id];
  const [workers,sites,assignments,sessions,absences,audits]=await Promise.all([
    db.query('SELECT id,name,job_title AS role,code,enabled,(pin_hash IS NOT NULL) AS activated FROM employees'+where+' ORDER BY name',params),
    db.query(admin?'SELECT * FROM sites ORDER BY name':'SELECT DISTINCT s.* FROM sites s JOIN assignments a ON a.site_id=s.id WHERE a.worker_id=$1 ORDER BY s.name',params),
    db.query('SELECT id,worker_id,site_id,to_char(work_date,\'YYYY-MM-DD\') AS work_date,start_time,end_time,note FROM assignments'+(admin?'':' WHERE worker_id=$1')+' ORDER BY work_date DESC LIMIT 4500',params),
    db.query('SELECT id,worker_id,site_id,assignment_id,to_char(work_date,\'YYYY-MM-DD\') AS work_date,start_at,end_at,corrected_break_minutes,approved,voided,correction_reason FROM work_sessions'+(admin?" WHERE (start_at >= NOW()-INTERVAL '15 months' OR end_at IS NULL)":" WHERE worker_id=$1 AND (start_at >= NOW()-INTERVAL '15 months' OR end_at IS NULL)")+' ORDER BY start_at DESC LIMIT 6000',params),
    db.query('SELECT id,worker_id,to_char(from_date,\'YYYY-MM-DD\') AS from_date,to_char(to_date,\'YYYY-MM-DD\') AS to_date,reason,status FROM absences'+(admin?'':' WHERE worker_id=$1')+' ORDER BY from_date DESC LIMIT 2000',params),
    admin?db.query('SELECT id,created_at,actor,action,details FROM audit_log ORDER BY created_at DESC LIMIT 100'):Promise.resolve({rows:[]})
  ]);
  const sessionIds=sessions.rows.map(r=>r.id);
  const breaks=sessionIds.length?await db.query('SELECT id,session_id,start_at,end_at FROM work_breaks WHERE session_id=ANY($1::uuid[]) ORDER BY start_at',[sessionIds]):{rows:[]};
  const bySession=new Map<string,Array<{id:string;startAt:string;endAt?:string}>>();
  for (const r of breaks.rows) {
    const list=bySession.get(r.session_id)||[];
    list.push({id:r.id,startAt:iso(r.start_at),...(r.end_at?{endAt:iso(r.end_at)}:{})});bySession.set(r.session_id,list);
  }
  return {
    employees:workers.rows.map(r=>({id:r.id,name:r.name,role:r.role,code:r.code,enabled:r.enabled,activated:r.activated})),
    sites:sites.rows.map(r=>({id:r.id,name:r.name,city:r.city,client:r.client,start:r.start_time.slice(0,5),end:r.end_time.slice(0,5),breakMinutes:r.planned_break_minutes,active:r.active})),
    assignments:assignments.rows.map(r=>({id:r.id,workerId:r.worker_id,siteId:r.site_id,date:r.work_date,start:r.start_time.slice(0,5),end:r.end_time.slice(0,5),note:r.note})),
    punches:sessions.rows.map((r:SessionRow)=>{
      const parts=bySession.get(r.id)||[];
      const measures=sessionMinutes(r.start_at,r.end_at??new Date(),parts,r.corrected_break_minutes);
      return {id:r.id,workerId:r.worker_id,siteId:r.site_id,assignmentId:r.assignment_id,workDate:r.work_date,
        inAt:iso(r.start_at),...(r.end_at?{outAt:iso(r.end_at)}:{}),breaks:parts,breakMinutes:measures.breakMinutes,netMinutes:measures.netMinutes,
        status:r.end_at?'completed':parts.some(p=>!p.endAt)?'paused':'working',approved:r.approved,voided:r.voided,correctionReason:r.correction_reason||undefined};
    }),
    absences:absences.rows.map(r=>({id:r.id,workerId:r.worker_id,from:r.from_date,to:r.to_date,reason:r.reason,status:r.status})),
    ...(admin?{audit:audits.rows.map(r=>({id:r.id,at:iso(r.created_at),actor:r.actor,action:r.action,details:r.details}))}:{})
  };
}
export async function GET(request:NextRequest) {
  try {
    if (!isConfigured()) return json({configured:false,error:'Configurez PostgreSQL et APP_SESSION_SECRET avant toute utilisation réelle.'});
    const db=database();
    const admin=await one(db,'SELECT id,display_name FROM admin_account WHERE id=1');
    if (!admin) return json({configured:true,setupRequired:true});
    const actor=readSession(request);
    if (!actor) return json({configured:true,authenticated:false});
    try {await requireActor(db,request);} catch(e) { if(e instanceof ApiError && e.status===401)return json({configured:true,authenticated:false});throw e; }
    const me=actor.role==='admin'?{id:'admin',name:admin.display_name}:(await one<{id:string;name:string;code:string}>(db,'SELECT id,name,code FROM employees WHERE id=$1',[actor.id]));
    const data=await getState(db,actor);
    return json({configured:true,authenticated:true,role:actor.role,me,data});
  } catch(e) {return handle(e);}
}

async function beginPunch(db:PoolClient,actor:{id:string},op:string,b:Record<string,unknown>) {
  // Row lock serializes all punch commands from a worker, across serverless instances.
  const worker=await one(db,'SELECT id FROM employees WHERE id=$1 AND enabled=true FOR UPDATE',[actor.id]);
  if(!worker) throw new ApiError('Compte salarié inactif.',403);
  const requestId=value(b.requestId,70);
  if(!/^[a-f0-9-]{36}$/i.test(requestId)) throw new ApiError('Identifiant de requête requis.');
  const actorLabel='worker:'+actor.id;
  const existing=await one<{response:unknown}>(db,'SELECT response FROM request_receipts WHERE actor=$1 AND request_id=$2',[actorLabel,requestId]);
  if(existing) return existing.response;
  const live=await one<SessionRow>(db,'SELECT id,worker_id,site_id,assignment_id,to_char(work_date,\'YYYY-MM-DD\') AS work_date,start_at,end_at,corrected_break_minutes,approved,voided,correction_reason FROM work_sessions WHERE worker_id=$1 AND end_at IS NULL AND voided=false FOR UPDATE',[actor.id]);
  const at=new Date(); let sessionId='';
  const currentBreak=live?await one<{id:string}>(db,'SELECT id FROM work_breaks WHERE session_id=$1 AND end_at IS NULL FOR UPDATE',[live.id]):null;
  const stage:ClockStatus=!live?'idle':currentBreak?'paused':'working';
  try {transition(stage,op as ClockAction);} catch {throw new ApiError('Action incompatible avec votre pointage actuel. Actualisez la page.',409);}
  if (op==='clockIn') {
    if(live) throw new ApiError('Une journée est déjà en cours. Actualisez votre page.',409);
    const assignmentId=value(b.assignmentId,50);
    const assignment=await one<{id:string;site_id:string;worker_id:string;work_date:string;client:string;name:string}>(db,`SELECT a.id,a.worker_id,a.site_id,to_char(a.work_date,'YYYY-MM-DD') AS work_date,s.client,s.name FROM assignments a JOIN sites s ON s.id=a.site_id WHERE a.id=$1 AND a.worker_id=$2 AND s.active=true FOR UPDATE OF a`,[assignmentId,actor.id]);
    if(!assignment || assignment.work_date!==nowDate()) throw new ApiError('Aucune affectation valide pour aujourd’hui.',409);
    const absence=await one(db,"SELECT id FROM absences WHERE worker_id=$1 AND status='approved' AND from_date <= $2 AND to_date >= $2",[actor.id,nowDate()]);
    if(absence) throw new ApiError('Vous êtes déclaré absent aujourd’hui. Contactez la direction.',409);
    const another=await one(db,'SELECT id FROM work_sessions WHERE worker_id=$1 AND voided=false AND start_at<$2 AND (end_at IS NULL OR end_at>$2) LIMIT 1',[actor.id,at]);
    if(another)throw new ApiError('Un pointage existant couvre déjà cette heure.',409);
    sessionId=newId();
    await db.query('INSERT INTO work_sessions(id,worker_id,site_id,assignment_id,work_date,start_at,site_label_at_start,client_at_start) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[sessionId,actor.id,assignment.site_id,assignment.id,nowDate(),at,assignment.name,assignment.client]);
  } else {
    if(!live) throw new ApiError('Aucune journée en cours. Actualisez votre page.',409);
    sessionId=live.id;
    const openBreak=currentBreak;
    if(op==='pauseStart') {
      if(openBreak) throw new ApiError('Vous êtes déjà en pause.',409);
      await db.query('INSERT INTO work_breaks(id,session_id,start_at) VALUES($1,$2,$3)',[newId(),sessionId,at]);
    } else if(op==='pauseEnd') {
      if(!openBreak) throw new ApiError('Aucune pause à terminer.',409);
      await db.query('UPDATE work_breaks SET end_at=$1 WHERE id=$2',[at,openBreak.id]);
    } else if(op==='clockOut') {
      if(openBreak) throw new ApiError('Terminez votre pause avant de finir la journée.',409);
      await db.query('UPDATE work_sessions SET end_at=$1,updated_at=NOW() WHERE id=$2',[at,sessionId]);
    } else throw new ApiError('Action de pointage inconnue.');
  }
  await db.query('INSERT INTO punch_events(id,session_id,worker_id,action,actor,payload) VALUES($1,$2,$3,$4,$5,$6)',[newId(),sessionId,actor.id,op==='clockIn'?'clock_in':op==='pauseStart'?'pause_start':op==='pauseEnd'?'pause_end':'clock_out',actorLabel,JSON.stringify({requestId})]);
  const response={ok:true,sessionId,action:op,at:at.toISOString()};
  await db.query('INSERT INTO request_receipts(actor,request_id,response) VALUES($1,$2,$3)',[actorLabel,requestId,JSON.stringify(response)]);
  return response;
}

export async function POST(request:NextRequest) {
  try {
    checkOrigin(request);
    if(Number(request.headers.get('content-length')||0)>16384) throw new ApiError('Requête trop volumineuse.',413);
    const b=await request.json() as Record<string,unknown>;
    const op=value(b.op,40);
    if(op==='logout'){const response=json({ok:true});response.cookies.delete(cookieOptions.name);return response;}
    if(!isConfigured()) throw new ApiError('Serveur non configuré.',503);
    if(op==='setup'){
      const key=process.env.APP_SETUP_KEY;
      if(!key || key.length<12 || value(b.key,300)!==key) throw new ApiError('Clé de première installation incorrecte.',403);
      const name=value(b.name,80),password=value(b.password,300);
      if(!name||password.length<12) throw new ApiError('Nom et mot de passe de 12 caractères minimum requis.');
      const {salt,hash}=passwordHash(password);
      await transaction(async db=>{
        const existing=await one(db,'SELECT id FROM admin_account WHERE id=1 FOR UPDATE');
        if(existing)throw new ApiError('Direction déjà activée.',409);
        await db.query('INSERT INTO admin_account(id,display_name,password_hash,password_salt) VALUES(1,$1,$2,$3)',[name,hash,salt]);
        await storeAudit(db,'admin','setup','Compte direction créé');
      });
      return authenticateResponse('admin','admin');
    }
    if(op==='login') {
      const kind=value(b.role,10);
      if(kind==='admin') {
        const ok=await transaction(async db=>{
          const admin=await one<{id:number;password_hash:string;password_salt:string;failed_attempts:number;blocked_until:Date|null}>(db,'SELECT * FROM admin_account WHERE id=1 FOR UPDATE');
          if(!admin)throw new ApiError('Le compte direction doit être activé.',409);
          if(admin.blocked_until && admin.blocked_until.getTime()>Date.now()) return false;
          const valid=checkPassword(value(b.password,300),admin.password_salt,admin.password_hash);
          await db.query('UPDATE admin_account SET failed_attempts=$1,blocked_until=$2 WHERE id=1',[valid?0:(admin.failed_attempts+1)%5,valid?null:(admin.failed_attempts+1)>=5?new Date(Date.now()+15*60000):null]);
          return valid;
        });
        if(!ok)throw new ApiError('Identifiants incorrects ou compte temporairement verrouillé.',401);
        return authenticateResponse('admin','admin');
      }
      const code=value(b.code,20).toUpperCase(),pin=value(b.pin,30);
      const user=await transaction(async db=>{
        const worker=await one<{id:string;enabled:boolean;pin_hash:string|null;pin_salt:string|null;session_version:number;failed_attempts:number;blocked_until:Date|null}>(db,'SELECT * FROM employees WHERE code=$1 FOR UPDATE',[code]);
        if(!worker?.enabled || !worker.pin_hash || !worker.pin_salt) return null;
        if(worker.blocked_until && worker.blocked_until.getTime()>Date.now())return null;
        const valid=checkPassword(pin,worker.pin_salt,worker.pin_hash);
        await db.query('UPDATE employees SET failed_attempts=$1,blocked_until=$2 WHERE id=$3',[valid?0:(worker.failed_attempts+1)%5,valid?null:(worker.failed_attempts+1)>=5?new Date(Date.now()+15*60000):null,worker.id]);
        return valid?{id:worker.id,version:worker.session_version}:null;
      });
      if(!user) throw new ApiError('Identifiants incorrects ou compte temporairement verrouillé.',401);
      return authenticateResponse('worker',user.id,user.version);
    }
    if(op==='activate') {
      const token=value(b.token,300),pin=value(b.pin,20);
      if(!/^[0-9]{6}$/.test(pin)) throw new ApiError('Choisissez un PIN de 6 chiffres.');
      const result=await transaction(async db=>{
        const employee=await one<{id:string;enabled:boolean;pin_hash:string|null;invite_expires_at:Date|null;session_version:number}>(db,'SELECT id,enabled,pin_hash,invite_expires_at,session_version FROM employees WHERE invite_hash=$1 FOR UPDATE',[sha256(token)]);
        if(!employee?.enabled || !employee.invite_expires_at || employee.invite_expires_at.getTime()<Date.now() || employee.pin_hash) throw new ApiError('Invitation invalide ou expirée.',403);
        const {salt,hash}=passwordHash(pin);
        await db.query('UPDATE employees SET pin_hash=$1,pin_salt=$2,invite_hash=NULL,invite_expires_at=NULL,failed_attempts=0,blocked_until=NULL WHERE id=$3',[hash,salt,employee.id]);
        await storeAudit(db,'worker:'+employee.id,'activate','Compte salarié activé');
        return {id:employee.id,version:employee.session_version};
      });
      return authenticateResponse('worker',result.id,result.version);
    }
    const actor=readSession(request);
    if(!actor) throw new ApiError('Connexion nécessaire.',401);
    if(['clockIn','pauseStart','pauseEnd','clockOut'].includes(op)) {
      if(actor.role!=='worker') throw new ApiError('Pointage réservé aux salariés.',403);
      const response=await transaction(async db=>{await requireActor(db,request);return beginPunch(db,actor,op,b);});
      return json(response);
    }
    if(op==='addWorker'){
      const name=value(b.name,100),title=value(b.role,60)||'Poseur';required(name,'Nom obligatoire.');
      const output=await transaction(async db=>{
        await requireActor(db,request,true);const id=newId();const code=employeeCode();
        await db.query('INSERT INTO employees(id,name,job_title,code) VALUES($1,$2,$3,$4)',[id,name,title,code]);
        await storeAudit(db,'admin','employeeCreate',name);return {ok:true,workerId:id,code};
      });return json(output);
    }
    if(op==='invite') {
      const workerId=value(b.workerId,50),token=randomToken(32);
      await transaction(async db=>{
        await requireActor(db,request,true);
        const e=await one<{id:string;name:string;pin_hash:string|null;enabled:boolean}>(db,'SELECT * FROM employees WHERE id=$1 FOR UPDATE',[workerId]);
        if(!e?.enabled)throw new ApiError('Salarié introuvable.',404);
        if(e.pin_hash)throw new ApiError('Compte déjà activé. Demandez une réinitialisation de code.',409);
        await db.query("UPDATE employees SET invite_hash=$1,invite_expires_at=NOW()+interval '7 days' WHERE id=$2",[sha256(token),workerId]);
        await storeAudit(db,'admin','invitation','Invitation créée pour '+e.name);
      });return json({ok:true,token,expiresInDays:7});
    }
    if(op==='resetPin') {
      const workerId=value(b.workerId,50),token=randomToken(32);
      await transaction(async db=>{
        await requireActor(db,request,true);
        const e=await one<{id:string;name:string;enabled:boolean}>(db,'SELECT id,name,enabled FROM employees WHERE id=$1 FOR UPDATE',[workerId]);
        if(!e?.enabled)throw new ApiError('Salarié indisponible.',404);
        await db.query("UPDATE employees SET pin_hash=NULL,pin_salt=NULL,session_version=session_version+1,invite_hash=$1,invite_expires_at=NOW()+interval '7 days',failed_attempts=0,blocked_until=NULL WHERE id=$2",[sha256(token),workerId]);
        await storeAudit(db,'admin','pinReset','Code réinitialisé pour '+e.name);
      });return json({ok:true,token,expiresInDays:7});
    }
    if(op==='workerToggle') {
      await transaction(async db=>{
        await requireActor(db,request,true);
        const e=await one<{id:string;name:string;enabled:boolean}>(db,'SELECT id,name,enabled FROM employees WHERE id=$1 FOR UPDATE',[value(b.workerId,50)]);
        if(!e)throw new ApiError('Salarié introuvable.',404);
        await db.query('UPDATE employees SET enabled=$1,session_version=session_version+1 WHERE id=$2',[!e.enabled,e.id]);
        await storeAudit(db,'admin','employeeToggle',e.name+' : '+(!e.enabled?'actif':'désactivé'));
      });return json({ok:true});
    }
    if(op==='siteSave'){
      const name=value(b.name,100),city=value(b.city,100),client=value(b.client,100);
      const start=timeField(b.start),end=timeField(b.end),breakMinutes=Number(b.breakMinutes);
      if(!name||!city||!client||asMinutes(end)<=asMinutes(start)||!positive(breakMinutes,0,240))throw new ApiError('Chantier : renseignez client, horaires et pause valides.');
      await transaction(async db=>{
        await requireActor(db,request,true);
        const id=value(b.id,50);
        if(id){
          const found=await one(db,'SELECT id FROM sites WHERE id=$1 FOR UPDATE',[id]);if(!found)throw new ApiError('Chantier introuvable.',404);
          await db.query('UPDATE sites SET name=$1,city=$2,client=$3,start_time=$4,end_time=$5,planned_break_minutes=$6 WHERE id=$7',[name,city,client,start,end,breakMinutes,id]);
        } else await db.query('INSERT INTO sites(id,name,city,client,start_time,end_time,planned_break_minutes) VALUES($1,$2,$3,$4,$5,$6,$7)',[newId(),name,city,client,start,end,breakMinutes]);
        await storeAudit(db,'admin','siteSave',name);
      });return json({ok:true});
    }
    if(op==='assign') {
      const workerId=value(b.workerId,50),siteId=value(b.siteId,50),day=dateField(b.date),start=timeField(b.start),end=timeField(b.end),note=value(b.note,500);
      if(asMinutes(end)<=asMinutes(start))throw new ApiError('La fin doit être après le début.');
      await transaction(async db=>{
        await requireActor(db,request,true);
        const e=await one(db,'SELECT id FROM employees WHERE id=$1 AND enabled=true FOR UPDATE',[workerId]);
        const s=await one(db,'SELECT id FROM sites WHERE id=$1 AND active=true',[siteId]);if(!e||!s)throw new ApiError('Salarié ou chantier indisponible.',404);
        const absence=await one(db,"SELECT id FROM absences WHERE worker_id=$1 AND status='approved' AND from_date<=$2 AND to_date>=$2",[workerId,day]);
        if(absence)throw new ApiError('Salarié déclaré absent ce jour.',409);
        const overlapping=await one(db,'SELECT id FROM assignments WHERE worker_id=$1 AND work_date=$2 AND start_time<$3 AND end_time>$4 LIMIT 1',[workerId,day,end,start]);
        if(overlapping)throw new ApiError('Horaires chevauchants avec une affectation existante.',409);
        await db.query('INSERT INTO assignments(id,worker_id,site_id,work_date,start_time,end_time,note) VALUES($1,$2,$3,$4,$5,$6,$7)',[newId(),workerId,siteId,day,start,end,note]);
        await storeAudit(db,'admin','assignmentCreate',`${day} ${workerId} → ${siteId}`);
      });return json({ok:true});
    }
    if(op==='removeAssignment') {
      await transaction(async db=>{
        await requireActor(db,request,true);
        const id=value(b.assignmentId,50);
        const session=await one(db,'SELECT id FROM work_sessions WHERE assignment_id=$1 LIMIT 1',[id]);
        if(session)throw new ApiError('Cette affectation a déjà un pointage. Elle ne peut pas être supprimée.',409);
        const r=await db.query('DELETE FROM assignments WHERE id=$1',[id]);if(!r.rowCount)throw new ApiError('Affectation introuvable.',404);
        await storeAudit(db,'admin','assignmentDelete',id);
      });return json({ok:true});
    }
    if(op==='manualPunch') {
      const assignmentId=value(b.assignmentId,50),inAt=value(b.inAt,80),outAt=value(b.outAt,80),breakMins=Number(b.breakMinutes),reason=value(b.reason,500);
      if(reason.length<5 || !Number.isFinite(Date.parse(inAt)) || !Number.isFinite(Date.parse(outAt))) throw new ApiError('Horaires et motif obligatoires.');
      try{strictDuration(inAt,outAt,breakMins);}catch{throw new ApiError('Horaires ou pause incohérents.');}
      await transaction(async db=>{
        await requireActor(db,request,true);
        // Lock in the same order as a live punch: employee first, assignment second.
        // This prevents a deadlock between an admin manual entry and clockIn.
        const owner=await one<{worker_id:string}>(db,'SELECT worker_id FROM assignments WHERE id=$1',[assignmentId]);
        if(!owner)throw new ApiError('Affectation introuvable.',404);
        await one(db,'SELECT id FROM employees WHERE id=$1 FOR UPDATE',[owner.worker_id]);
        const a=await one<{id:string;site_id:string;worker_id:string;work_date:string;client:string;name:string}>(db,`SELECT a.id,a.site_id,a.worker_id,to_char(a.work_date,'YYYY-MM-DD') AS work_date,s.client,s.name FROM assignments a JOIN sites s ON s.id=a.site_id WHERE a.id=$1 FOR UPDATE OF a`,[assignmentId]);
        if(!a)throw new ApiError('Affectation supprimée pendant votre opération.',409);
        const existing=await one(db,'SELECT id FROM work_sessions WHERE assignment_id=$1 AND voided=false',[assignmentId]);
        if(existing)throw new ApiError('Un pointage existe déjà sur cette affectation. Utilisez Correction.',409);
        if(ParisDate(new Date(inAt))!==a.work_date)throw new ApiError('La date d’entrée doit correspondre au jour prévu du chantier.',409);
        const overlapping=await one(db,'SELECT id FROM work_sessions WHERE worker_id=$1 AND voided=false AND start_at<$2 AND (end_at IS NULL OR end_at>$3) LIMIT 1',[a.worker_id,new Date(outAt),new Date(inAt)]);
        if(overlapping)throw new ApiError('Un autre pointage du salarié chevauche ces horaires.',409);
        const id=newId();
        await db.query('INSERT INTO work_sessions(id,worker_id,site_id,assignment_id,work_date,start_at,end_at,corrected_break_minutes,correction_reason,site_label_at_start,client_at_start) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,a.worker_id,a.site_id,assignmentId,a.work_date,new Date(inAt),new Date(outAt),breakMins,reason,a.name,a.client]);
        await db.query('INSERT INTO punch_events(id,session_id,worker_id,action,actor,payload) VALUES($1,$2,$3,$4,$5,$6)',[newId(),id,a.worker_id,'admin_correct','admin',JSON.stringify({manual:true,reason})]);
        await storeAudit(db,'admin','manualPunch',reason,null,{id,assignmentId,inAt,outAt,breakMins});
      });return json({ok:true});
    }
    if(op==='punchApprove'||op==='punchCorrect') {
      await transaction(async db=>{
        await requireActor(db,request,true);
        const id=value(b.punchId,50);
        const owner=await one<{worker_id:string}>(db,'SELECT worker_id FROM work_sessions WHERE id=$1',[id]);
        if(!owner)throw new ApiError('Pointage introuvable.',404);
        // Serialize manual fixes and live punches from the same employee.
        await one(db,'SELECT id FROM employees WHERE id=$1 FOR UPDATE',[owner.worker_id]);
        const p=await one<SessionRow>(db,'SELECT * FROM work_sessions WHERE id=$1 FOR UPDATE',[id]);
        if(!p||p.voided)throw new ApiError('Pointage introuvable.',404);
        if(op==='punchApprove' && !p.end_at)throw new ApiError('Le salarié n’a pas terminé sa journée.',409);
        if(op==='punchApprove'){
          const next=!p.approved;
          await db.query('UPDATE work_sessions SET approved=$1,updated_at=NOW() WHERE id=$2',[next,id]);
          await db.query('INSERT INTO punch_events(id,session_id,worker_id,action,actor,payload) VALUES($1,$2,$3,$4,$5,$6)',[newId(),id,p.worker_id,'admin_approve','admin',JSON.stringify({approved:next})]);
          await storeAudit(db,'admin','punchApprove',id,p.approved,next);
        } else {
          const inAt=value(b.inAt,80),outAt=value(b.outAt,80),pause=Number(b.breakMinutes),reason=value(b.reason,500);
          if(reason.length<5||!Number.isFinite(Date.parse(inAt))||!Number.isFinite(Date.parse(outAt)))throw new ApiError('Dates et motif de correction obligatoires.');
          try{strictDuration(inAt,outAt,pause);}catch{throw new ApiError('Horaires ou pause incohérents.');}
          const pendingBreak=await one<{start_at:Date}>(db,'SELECT start_at FROM work_breaks WHERE session_id=$1 AND end_at IS NULL FOR UPDATE',[p.id]);
          if(pendingBreak && new Date(outAt)<pendingBreak.start_at)throw new ApiError('La fin corrigée doit suivre le début de la pause ouverte.');
          const overlapping=await one(db,'SELECT id FROM work_sessions WHERE worker_id=$1 AND id<>$2 AND voided=false AND start_at<$3 AND (end_at IS NULL OR end_at>$4) LIMIT 1',[p.worker_id,p.id,new Date(outAt),new Date(inAt)]);
          if(overlapping)throw new ApiError('Correction impossible : chevauchement avec un autre pointage.',409);
          await db.query('UPDATE work_sessions SET start_at=$1,end_at=$2,work_date=$6,corrected_break_minutes=$3,correction_reason=$4,approved=false,updated_at=NOW() WHERE id=$5',[new Date(inAt),new Date(outAt),pause,reason,id,ParisDate(new Date(inAt))]);
          if(pendingBreak) await db.query('UPDATE work_breaks SET end_at=$1 WHERE session_id=$2 AND end_at IS NULL',[new Date(outAt),id]);
          await db.query('INSERT INTO punch_events(id,session_id,worker_id,action,actor,payload) VALUES($1,$2,$3,$4,$5,$6)',[newId(),id,p.worker_id,'admin_correct','admin',JSON.stringify({reason,adminClosedOpenSession:!p.end_at,before:{inAt:p.start_at,outAt:p.end_at,pause:p.corrected_break_minutes},after:{inAt,outAt,pause}})]);
          await storeAudit(db,'admin','punchCorrect',reason,{inAt:p.start_at,outAt:p.end_at,pause:p.corrected_break_minutes},{inAt,outAt,pause});
        }
      });return json({ok:true});
    }
    if(op==='absenceAdd'){
      const from=dateField(b.from),to=dateField(b.to),reason=value(b.reason,100);
      if(to<from||!reason)throw new ApiError('Dates ou motif invalides.');
      await transaction(async db=>{
        const a=await requireActor(db,request);
        const workerId=a.role==='worker'?a.id:value(b.workerId,50);
        const e=await one(db,'SELECT id FROM employees WHERE id=$1',[workerId]);if(!e)throw new ApiError('Salarié inconnu.',404);
        await db.query('INSERT INTO absences(id,worker_id,from_date,to_date,reason) VALUES($1,$2,$3,$4,$5)',[newId(),workerId,from,to,reason]);
        await storeAudit(db,a.role==='admin'?'admin':'worker:'+a.id,'absenceRequest',`${from} — ${to}`);
      });return json({ok:true});
    }
    if(op==='absenceResolve'){
      if(!['approved','rejected'].includes(value(b.status)))throw new ApiError('Statut invalide.');
      await transaction(async db=>{
        await requireActor(db,request,true);
        const a=await one<{id:string;worker_id:string;from_date:Date;to_date:Date;status:string}>(db,'SELECT * FROM absences WHERE id=$1 FOR UPDATE',[value(b.absenceId,50)]);
        if(!a || a.status!=='pending')throw new ApiError('Demande déjà traitée ou introuvable.',409);
        if(b.status==='approved'){
          const conflicting=await one(db,'SELECT id FROM assignments WHERE worker_id=$1 AND work_date BETWEEN $2 AND $3 LIMIT 1',[a.worker_id,a.from_date,a.to_date]);
          if(conflicting)throw new ApiError('Une affectation existe sur la période. Modifiez le planning avant approbation.',409);
        }
        await db.query('UPDATE absences SET status=$1 WHERE id=$2',[b.status,a.id]);
        await storeAudit(db,'admin','absenceResolve',String(b.status));
      });return json({ok:true});
    }
    throw new ApiError('Action inconnue.',404);
  } catch(e) {return handle(e);}
}
