import { NextRequest, NextResponse } from 'next/server';
import { database, isConfigured, withDatabase } from '@/lib/db';
import { requireActor } from '@/lib/security';
import { sessionMinutes, validDate } from '@/lib/time';
import { reportBounds } from '@/lib/period';
import { csvRows, csvHours } from '@/lib/csv';
import { finalTimesheetRows } from '@/lib/final-timesheet';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const fmt = (d:Date) => new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
export const GET=withDatabase(async function GET(req:NextRequest){
  try{
    if(!isConfigured())return NextResponse.json({error:'Service non configuré.'},{status:503});
    const db=database();await requireActor(db,req,true);
    const url=req.nextUrl.searchParams;
    const period=url.get('period')==='month'?'month':'week';
    const date=url.get('date')||'';
    if(!validDate(date))return NextResponse.json({error:'Date invalide.'},{status:400});
    const {start,end}=reportBounds(period,date);
    const client=(url.get('client')||'Tous').slice(0,100);
    const {rows}=await db.query(`SELECT ws.id, ws.worker_id,ws.site_id,to_char(ws.work_date,'YYYY-MM-DD') AS day,ws.start_at,ws.end_at,ws.corrected_break_minutes,
      COALESCE(NULLIF(ws.site_label_at_start,''),s.name) AS site_name,COALESCE(NULLIF(ws.client_at_start,''),s.client) AS client_name,
      s.city,e.name AS employee_name FROM work_sessions ws JOIN employees e ON e.id=ws.worker_id JOIN sites s ON s.id=ws.site_id
      WHERE ws.work_date BETWEEN $1 AND $2 AND ws.end_at IS NOT NULL AND ws.approved=true AND ws.voided=false ORDER BY ws.work_date, e.name`,[start,end]);
    const ids=rows.map(r=>r.id);
    const pauses=ids.length?(await db.query('SELECT session_id,start_at,end_at FROM work_breaks WHERE session_id = ANY($1::uuid[]) ORDER BY start_at',[ids])).rows:[];
    const by=new Map<string,Array<{startAt:Date;endAt:Date|null}>>();
    for(const b of pauses){const current=by.get(b.session_id)||[];current.push({startAt:b.start_at,endAt:b.end_at});by.set(b.session_id,current);}
    const raw=rows.filter(r=>client==='Tous'||r.client_name.toLowerCase()===client.toLowerCase());
    const records=raw.map(r=>({...r,...sessionMinutes(r.start_at,r.end_at,(by.get(r.id)||[]),r.corrected_break_minutes)}));
    if(url.get('format')==='final'){
      if(period!=='month')return NextResponse.json({error:'La feuille finale est disponible pour une période mensuelle.'},{status:400});
      const csv=finalTimesheetRows(records.map(r=>({employee:r.employee_name,site:r.site_name,day:r.day,netMinutes:r.netMinutes})),date.slice(0,7),client);
      const filename='ABMIL-POSE-feuille-finale-'+date.slice(0,7)+'-'+(client==='Tous'?'tous':client.replace(/[^a-z0-9-]/gi,'_'))+'.csv';
      return new NextResponse(csv,{status:200,headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    const summary=new Map<string,{employee:string;site:string;client:string;days:Set<string>;mins:number}>();
    for(const r of records){const key=r.worker_id+':'+r.site_id+':'+r.client_name;
      const x=summary.get(key)||{employee:r.employee_name,site:r.site_name,client:r.client_name,days:new Set<string>(),mins:0};
      x.days.add(r.day);x.mins+=r.netMinutes;summary.set(key,x);
    }
    const data:(string|number)[][]=[
      ['ABMIL POSE — RELEVÉ DES HEURES VALIDÉES','','','','','','','','','',''],
      ['Période',period==='month'?'Mois':'Semaine','Du',start,'Au',end,'Client',client,'','',''],
      ['Client','Chantier','Ville','Salarié','Date','Entrée','Départ','Pause (min)','Présence (min)','Heures nettes','Statut'],
      ...records.map(r=>[r.client_name,r.site_name,r.city,r.employee_name,r.day,fmt(r.start_at),fmt(r.end_at),r.breakMinutes,r.grossMinutes,csvHours(r.netMinutes),'Validé']),
      ['','','','','','','','','','',''],
      ['SYNTHÈSE PAR SALARIÉ ET CHANTIER','','','','','','','','','',''],
      ['Client','Chantier','','Salarié','Jours travaillés','','','','','Heures nettes',''],
      ...Array.from(summary.values()).map(r=>[r.client,r.site,'',r.employee,r.days.size,'','','','',csvHours(r.mins),'']),
      ['TOTAL','','','','','','','','',csvHours(records.reduce((n,r)=>n+r.netMinutes,0)),'']
    ];
    const csv=csvRows(data);
    const filename='ABMIL-POSE-heures-'+period+'-'+start+'-'+(client==='Tous'?'tous':client.replace(/[^a-z0-9-]/gi,'_'))+'.csv';
    return new NextResponse(csv,{status:200,headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch(e){console.error('Report generation failed',e instanceof Error?e.message:'unknown');return NextResponse.json({error:'Rapport indisponible. Vérifiez votre session et réessayez.'},{status:503});}
});
