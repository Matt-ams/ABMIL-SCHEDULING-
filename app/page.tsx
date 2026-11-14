'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ClipboardCheck, Clock3, Download, HardHat, LayoutDashboard, LogOut, MapPin, Menu, Plus, Search, Settings2, ShieldCheck, Users, X, Check, ChevronLeft, ChevronRight, Play, Square, UserRound, Copy, CalendarOff, CircleAlert, FileSpreadsheet, Pencil, ArrowRight, LockKeyhole, RefreshCw, BriefcaseBusiness } from 'lucide-react';
import type { Absence, Assignment, Audit, Employee, Punch, Site } from '@/lib/types';

type Data = { employees: Employee[]; sites: Site[]; assignments: Assignment[]; punches: Punch[]; absences: Absence[]; audit?: Audit[] };
type AuthState = { configured: boolean; setupRequired?: boolean; authenticated?: boolean; role?: 'admin'|'worker'; me?: { id:string; name:string; code?:string }; data?: Data; error?:string };
type Modal = 'worker'|'site'|'shift'|'absence'|'correction'|'manual'|'invite'|null;
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const ymd = (d:Date) => { const y=d.getFullYear();return y+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const toDate = (s:string) => new Date(s+'T12:00:00');
const plusDays = (d:Date,n:number) => {const c=new Date(d);c.setDate(c.getDate()+n);return c;};
const getMonday=(d:Date) => plusDays(d,-((d.getDay()+6)%7));
const labelDate=(s:string)=>toDate(s).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
const fmtTime=(iso:string)=>new Date(iso).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
const fmtDate=(iso:string)=>new Date(iso).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',year:'numeric'});
const minutes=(a:string,b:string) => Math.max(0, Math.round((Date.parse(b)-Date.parse(a))/60000));
const worked=(p:Punch)=>p.outAt?Math.max(0,p.netMinutes??(minutes(p.inAt,p.outAt)-p.breakMinutes)):0;
const decimal=(min:number)=> (min/60).toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:2});
const range=(start:string,end:string)=> Math.max(0,(Number(end.slice(0,2))*60+Number(end.slice(3)))-(Number(start.slice(0,2))*60+Number(start.slice(3))));
const uid=()=>Math.random().toString(36).slice(2,12);
const initialWorker = { name:'',role:'Poseur' };
const initialSite = {name:'',city:'',client:'Fontanel',start:'07:30',end:'16:00',breakMinutes:30};
const DAYS=['LUN','MAR','MER','JEU','VEN','SAM','DIM'];
const NAV=[{id:'dashboard',label:'Vue d’ensemble',icon:LayoutDashboard},{id:'planning',label:'Planning',icon:CalendarDays},{id:'sites',label:'Chantiers',icon:HardHat},{id:'team',label:'Salariés',icon:Users},{id:'punches',label:'Pointages & heures',icon:Clock3},{id:'absences',label:'Absences',icon:CalendarOff}];
function exampleData():Data {
  const base=getMonday(toDate(today()));const day=(n:number)=>ymd(plusDays(base,n));
  const employees:Employee[]=[{id:'w1',name:'Karim B.',role:'Chef d’équipe',code:'A01DEMO1',enabled:true,activated:true},{id:'w2',name:'Sofiane M.',role:'Poseur',code:'A02DEMO2',enabled:true},{id:'w3',name:'Thomas R.',role:'Poseur',code:'A03DEMO3',enabled:true},{id:'w4',name:'Nicolas D.',role:'Menuisier',code:'A04DEMO4',enabled:true}];
  const sites:Site[]=[{id:'s1',name:'Résidence Horizon',city:'Cergy',client:'Fontanel',start:'07:30',end:'16:00',breakMinutes:30,active:true},{id:'s2',name:'Bureaux République',city:'Paris',client:'Client exemple',start:'08:00',end:'17:00',breakMinutes:60,active:true}];
  const assignments:Assignment[]=[];
  for(let d=0;d<5;d++)for(let i=0;i<4;i++){ const site=sites[i<2?0:1];assignments.push({id:'a'+d+'-'+i,workerId:employees[i].id,siteId:site.id,date:day(d),start:site.start,end:site.end,note:''});}
  const past=day(0)+'T07:32:00Z';
  const punches:Punch[]=[{id:'p1',workerId:'w1',siteId:'s1',assignmentId:'a0-0',workDate:day(0),status:'completed',breaks:[{id:'b1',startAt:day(0)+'T11:00:00Z',endAt:day(0)+'T11:30:00Z'}],inAt:past,outAt:day(0)+'T15:15:00Z',breakMinutes:30,approved:true}];
  return {employees,sites,assignments,punches,absences:[{id:'abs1',workerId:'w4',from:day(5),to:day(6),reason:'Congés',status:'pending'}],audit:[]};
}

function siteColor(siteId:string, sites:Site[]) {
  const index=sites.findIndex(s=>s.id===siteId);
  return String((index<0?0:index)%6);
}

function Avatar({name,size='regular'}:{name:string;size?:'regular'|'large'}){return <div className={'avatar '+size}>{name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()}</div>;}
function Tag({children,kind='muted'}:{children:React.ReactNode;kind?:'ok'|'warning'|'muted'|'danger'}){return <span className={'tag '+kind}>{children}</span>;}
function BigBlank({icon:Icon,title,detail}:{icon:React.ComponentType<{size?:number}>;title:string;detail:string}){return <div className="blank"><div className="blankIcon"><Icon size={27}/></div><b>{title}</b><p>{detail}</p></div>;}

export default function Page() {
  const [auth,setAuth]=useState<AuthState|null>(null);
  const [connection,setConnection]=useState<'online'|'offline'>('online');
  const [demo,setDemo]=useState(false);
  const [demoRole,setDemoRole]=useState<'admin'|'worker'>('admin');
  const [demoData,setDemoData]=useState<Data>(exampleData);
  const [page,setPage]=useState('dashboard');
  const [planningView,setPlanningView]=useState<'team'|'sites'>('team');
  const [planningSiteFilter,setPlanningSiteFilter]=useState('all');
  const [week,setWeek]=useState(getMonday(toDate(today())));
  const [mobileMenu,setMobileMenu]=useState(false);
  const [modal,setModal]=useState<Modal>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [invitation,setInvitation]=useState('');
  const [inviteCode,setInviteCode]=useState('');
  const [workerForm,setWorkerForm]=useState(initialWorker);
  const [siteForm,setSiteForm]=useState(initialSite);
  const [editingSiteId,setEditingSiteId]=useState('');
  const [shiftForm,setShiftForm]=useState({workerId:'',siteId:'',date:today(),start:'07:30',end:'16:00',note:''});
  const [absenceForm,setAbsenceForm]=useState({workerId:'',from:today(),to:today(),reason:'Congés'});
  const [correctionForm,setCorrectionForm]=useState({punchId:'',inAt:'',outAt:'',breakMinutes:30,reason:''});
  const [manualForm,setManualForm]=useState({assignmentId:'',inAt:'',outAt:'',breakMinutes:30,reason:''});
  const [loginRole,setLoginRole]=useState<'admin'|'worker'>('worker');
  const [loginCode,setLoginCode]=useState('');
  const [loginPin,setLoginPin]=useState('');
  const [loginPassword,setLoginPassword]=useState('');
  const [setup,setSetup]=useState({name:'',key:'',password:''});
  const [inviteToken,setInviteToken]=useState('');
  const [activationPin,setActivationPin]=useState('');
  const [filter,setFilter]=useState('');
  const [selectedClient,setSelectedClient]=useState('Fontanel');
  const [reportPeriod,setReportPeriod]=useState<'week'|'month'>('week');
  const [reportMonth,setReportMonth]=useState(today().slice(0,7));
  const [now,setNow]=useState(Date.now());
  // A failed network response may follow a successful database write. Reuse the same
  // request ID on retry so the server can return the first receipt safely.
  const pendingPunch=useRef<{op:string;requestId:string}|null>(null);
  useEffect(()=>{const hash=window.location.hash.match(/invitation=([^&]+)/);if(hash){setInviteToken(decodeURIComponent(hash[1]));const code=window.location.hash.match(/code=([^&]+)/);if(code)setLoginCode(decodeURIComponent(code[1]));}},[]);
  useEffect(()=>{refresh();const interval=setInterval(()=>setNow(Date.now()),30000);return ()=>clearInterval(interval);},[]);
  useEffect(()=>{if(!auth?.authenticated||demo)return;const interval=setInterval(refresh,auth.role==='admin'?30000:120000);return ()=>clearInterval(interval);},[auth?.authenticated,auth?.role,demo]);
  async function refresh() {
    try{
      const res=await fetch('/api',{cache:'no-store'});
      if(!res.ok){setConnection('offline');setAuth(prev=>prev||{configured:false,error:'Service temporairement inaccessible.'});return;}
      const payload=await res.json() as AuthState;setConnection('online');setAuth(payload);
    }catch{setConnection('offline');setAuth(prev=>prev||{configured:false,error:'Service temporairement inaccessible.'});}
  }
  const data=demo?demoData:auth?.data;
  const role=demo?demoRole:auth?.role;
  const me=demo?(demoRole==='admin'?{id:'admin',name:'Direction ABMIL'}:{id:'w1',name:'Karim B.',code:'A01DEMO1'}):auth?.me;
  const admin=role==='admin';
  const dayKeys=useMemo(()=>Array.from({length:7},(_,i)=>ymd(plusDays(week,i))),[week]);
  const actualWeekKeys=Array.from({length:7},(_,i)=>ymd(plusDays(getMonday(toDate(today())),i)));
  const visibleAssignments=data?.assignments.filter(a=>dayKeys.includes(a.date))||[];
  const planningAssignments=visibleAssignments.filter(a=>planningSiteFilter==='all'||a.siteId===planningSiteFilter);
  const employee=(id:string)=>data?.employees.find(x=>x.id===id);
  const site=(id:string)=>data?.sites.find(x=>x.id===id);
  const livePunch=data?.punches.find(x=>x.workerId===me?.id&&!x.outAt&&!x.voided);
  const teamActive=(data?.punches||[]).filter(x=>!x.outAt&&!x.voided);
  const currentMonth=reportMonth;
  const periodRecords=(data?.punches||[]).filter(p=>p.outAt&&!p.voided&&(reportPeriod==='month'?(p.workDate||p.inAt.slice(0,10)).startsWith(currentMonth):dayKeys.includes(p.workDate||p.inAt.slice(0,10))));
  const monthRecords=(data?.punches||[]).filter(p=>p.outAt&&!p.voided&&(p.workDate||p.inAt.slice(0,10)).startsWith(today().slice(0,7)));
  const runningWorked=(p:Punch)=>p.outAt?worked(p):Math.max(0,Math.round((now-Date.parse(p.inAt))/60000)-p.breaks.reduce((n,b)=>n+minutes(b.startAt,b.endAt||new Date(now).toISOString()),0));
  const groupedDaily=Object.values(periodRecords.reduce<Record<string,{key:string;workerId:string;date:string;minutes:number;count:number}>>((acc,p)=>{const date=p.workDate||p.inAt.slice(0,10);const key=p.workerId+'|'+date;const old=acc[key]||{key,workerId:p.workerId,date,minutes:0,count:0};old.minutes+=worked(p);old.count+=1;acc[key]=old;return acc;},{})).sort((a,b)=>b.date.localeCompare(a.date)||a.workerId.localeCompare(b.workerId));
  const todayRecords=(data?.punches||[]).filter(p=>p.outAt&&!p.voided&&(p.workDate||p.inAt.slice(0,10))===today());
  const workerToday=data?.assignments.filter(x=>x.workerId===me?.id&&x.date===today())||[];
  const availableShifts=workerToday.filter(a=>!(data?.punches||[]).some(p=>p.assignmentId===a.id&&!p.voided));
  const finishedToday=!livePunch&&workerToday.length>0&&!availableShifts.length;
  const clockPhase=finishedToday?4:!livePunch?0:livePunch.status==='paused'?2:livePunch.breaks.length?3:1;
  const [chosenShift,setChosenShift]=useState('');
  const activeShift=(livePunch?data?.assignments.find(x=>x.id===livePunch.assignmentId):undefined)||availableShifts.find(x=>x.id===chosenShift)||availableShifts[0]||workerToday[0];
  const isInvite=!!inviteToken&&!auth?.authenticated&&!demo;
  const plannedNet=(a:Assignment)=>Math.max(0,range(a.start,a.end)-(site(a.siteId)?.breakMinutes||0));
  const daysHours=(id:string)=> (data?.assignments||[]).filter(a=>a.workerId===id && actualWeekKeys.includes(a.date)).reduce((n,a)=>n+plannedNet(a),0);
  const weekApproved=(data?.punches||[]).filter(p=>p.outAt&&p.approved&&!p.voided && actualWeekKeys.includes(p.workDate||p.inAt.slice(0,10)));
  const totalActual=(data?.punches||[]).filter(p=>p.outAt&&!p.voided).reduce((n,p)=>n+worked(p),0);
  async function action(op:string, payload:Record<string,unknown>={},onOk?: (response:Record<string,unknown>)=>void) {
    if(busy)return;
    setBusy(true);setError('');setSuccess('');
    try {
      if(!demo&&connection==='offline')throw new Error('Connexion interrompue. Réessayez après le retour du réseau : aucun pointage hors ligne ne sera inventé.');
      if(demo) { const result=localAction(op,payload);if(onOk)onOk(result);setSuccess('Action simulée — aucune donnée transmise au serveur.');return; }
      const isPunch=['clockIn','pauseStart','pauseEnd','clockOut'].includes(op);
      if(isPunch && pendingPunch.current?.op!==op)pendingPunch.current={op,requestId:crypto.randomUUID()};
      const response=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,...payload,...(isPunch?{requestId:pendingPunch.current!.requestId}:{})})});
      const output=await response.json() as Record<string,unknown>;
      if(!response.ok){if(isPunch&&response.status===409)pendingPunch.current=null;throw new Error(typeof output.error==='string'?output.error:'Une erreur est survenue.');}
      if(isPunch)pendingPunch.current=null;
      if(onOk)onOk(output);
      await refresh();
      if(op==='logout') {setAuth({configured:true,authenticated:false});setInviteToken('');}
      if(!['login','activate','setup'].includes(op))setSuccess('Modifications enregistrées.');
    }catch(e){setError(e instanceof Error?e.message:'Erreur inconnue.');if(!demo)await refresh();}
    finally{setBusy(false);}
  }
  function localAction(op:string,p:Record<string,unknown>):Record<string,unknown>{
    const cur=structuredClone(demoData);
    if(op==='addWorker'){const id=uid();cur.employees.push({id,name:String(p.name),role:String(p.role||'Poseur'),code:'DEMO'+id.slice(0,4).toUpperCase(),enabled:true});}
    if(op==='siteSave'){const found=cur.sites.find(s=>s.id===p.id);const next={id:found?.id||uid(),name:String(p.name),city:String(p.city),client:String(p.client),start:String(p.start),end:String(p.end),breakMinutes:Number(p.breakMinutes),active:true};if(found)Object.assign(found,next);else cur.sites.push(next);}
    if(op==='assign'){if(cur.assignments.some(a=>a.workerId===p.workerId&&a.date===p.date&&String(p.start)<a.end&&String(p.end)>a.start))throw new Error('Chevauchement avec une affectation existante.');cur.assignments.push({id:uid(),workerId:String(p.workerId),siteId:String(p.siteId),date:String(p.date),start:String(p.start),end:String(p.end),note:String(p.note||'')});}
    if(op==='removeAssignment')cur.assignments=cur.assignments.filter(x=>x.id!==p.assignmentId);
    if(op==='absenceAdd')cur.absences.push({id:uid(),workerId:String(p.workerId||me?.id),from:String(p.from),to:String(p.to),reason:String(p.reason),status:'pending'});
    if(op==='absenceResolve'){const x=cur.absences.find(a=>a.id===p.absenceId);if(x)x.status=String(p.status) as Absence['status'];}
    if(op==='punchApprove'){const x=cur.punches.find(a=>a.id===p.punchId);if(x)x.approved=!x.approved;}
    if(op==='punchCorrect'){const x=cur.punches.find(a=>a.id===p.punchId);if(x){x.inAt=String(p.inAt);x.outAt=String(p.outAt);x.breakMinutes=Number(p.breakMinutes);x.correctionReason=String(p.reason);x.approved=false;x.netMinutes=Math.max(0,minutes(x.inAt,x.outAt)-x.breakMinutes);}}
    if(op==='workerToggle'){const x=cur.employees.find(a=>a.id===p.workerId);if(x)x.enabled=!x.enabled;}
    if(op==='clockIn'){if(cur.punches.some(x=>x.workerId===me?.id&&!x.outAt&&!x.voided))throw new Error('Vous avez déjà une journée en cours.');const a=cur.assignments.find(x=>x.id===p.assignmentId);if(!a)throw new Error('Affectation manquante.');cur.punches.push({id:uid(),workerId:'w1',siteId:a.siteId,assignmentId:a.id,workDate:a.date,status:'working',breaks:[],inAt:new Date().toISOString(),breakMinutes:0,approved:false});}
    if(['pauseStart','pauseEnd','clockOut'].includes(op)){const x=cur.punches.find(x=>x.workerId==='w1'&&!x.outAt);if(!x)throw new Error('Aucun pointage en cours.');const active=x.breaks.find(b=>!b.endAt);if(op==='pauseStart'){if(active)throw new Error('Pause déjà en cours.');x.breaks.push({id:uid(),startAt:new Date().toISOString()});x.status='paused';}else if(op==='pauseEnd'){if(!active)throw new Error('Aucune pause à terminer.');active.endAt=new Date().toISOString();x.breakMinutes=x.breaks.reduce((n,b)=>n+(b.endAt?minutes(b.startAt,b.endAt):0),0);x.status='working';}else{if(active)throw new Error('Terminez votre pause avant de quitter.');x.outAt=new Date().toISOString();x.status='completed';x.breakMinutes=x.breaks.reduce((n,b)=>n+(b.endAt?minutes(b.startAt,b.endAt):0),0);x.netMinutes=worked(x);}}
    setDemoData(cur);return {ok:true};
  }
  function openModal(kind:Modal){setModal(kind);setError('');setSuccess('');}
  function openShift(date=today(),workerId=''){
    const first=data?.sites[0];setShiftForm({workerId:workerId||data?.employees[0]?.id||'',siteId:first?.id||'',date,start:first?.start||'07:30',end:first?.end||'16:00',note:''});openModal('shift');
  }
  function openSite(current?:Site){setEditingSiteId(current?.id||'');setSiteForm(current?{name:current.name,city:current.city,client:current.client,start:current.start,end:current.end,breakMinutes:current.breakMinutes}:initialSite);openModal('site');}
  function openCorrection(current:Punch){
    const toLocal=(iso:string)=>{const d=new Date(iso);const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d);return parts.replace(' ','T');};
    setCorrectionForm({punchId:current.id,inAt:toLocal(current.inAt),outAt:toLocal(current.outAt||new Date().toISOString()),breakMinutes:current.breakMinutes,reason:''});openModal('correction');
  }
  function openManual(){
    const a=data?.assignments.find(a=>a.date===today())||data?.assignments[0];
    setManualForm({assignmentId:a?.id||'',inAt:a?`${a.date}T${a.start}`:'',outAt:a?`${a.date}T${a.end}`:'',breakMinutes:a?(site(a.siteId)?.breakMinutes||0):0,reason:''});
    openModal('manual');
  }
  function close(){setModal(null);setError('');setSuccess('');}
  async function downloadCsv(clientName:string){
    if(demo){setError('Les exports réels nécessitent le serveur et la base de données.');return;}
    setError('');setBusy(true);
    try{
      const date=reportPeriod==='month'?reportMonth+'-01':dayKeys[0];
      const response=await fetch(`/api/report?period=${reportPeriod}&date=${encodeURIComponent(date)}&client=${encodeURIComponent(clientName)}`,{cache:'no-store'});
      if(!response.ok)throw new Error('Le rapport n’a pas pu être généré. Vérifiez votre connexion.');
      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');anchor.href=url;anchor.download=`ABMIL_POSE_${clientName.replace(/[^a-z0-9]/gi,'_')}_${date}.csv`;
      anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
      setSuccess('Rapport des heures validées téléchargé.');
    }catch(e){setError(e instanceof Error?e.message:'Erreur du rapport.');}finally{setBusy(false);}
  }
  async function downloadFinalTimesheet(period:'week'|'month'){
    if(demo){setError('La feuille finale exige les pointages validés dans l’espace sécurisé.');return;}
    setError('');setBusy(true);
    try{
      const date=period==='month'?reportMonth+'-01':dayKeys[0];
      const response=await fetch(`/api/report?period=${period}&format=final&date=${encodeURIComponent(date)}&client=${encodeURIComponent(selectedClient)}`,{cache:'no-store'});
      if(!response.ok)throw new Error('La feuille finale n’a pas pu être générée. Vérifiez votre connexion et les validations de la période.');
      const blob=await response.blob();
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');anchor.href=url;anchor.download=`ABMIL_POSE_FEUILLE_FINALE_${period}_${selectedClient.replace(/[^a-z0-9]/gi,'_')}_${date.slice(0,period==='month'?7:10)}.csv`;
      anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
      setSuccess(`Feuille finale ${period==='month'?'mensuelle':'hebdomadaire'} téléchargée. Ouvrez-la dans Excel ou Numbers.`);
    }catch(e){setError(e instanceof Error?e.message:'Erreur de génération de la feuille finale.');}finally{setBusy(false);}
  }
  async function copyLink() {if(!invitation)return;try{await navigator.clipboard.writeText(invitation);setSuccess('Lien d’invitation copié.');}catch{setError('Copie impossible : sélectionnez le lien ci-dessous.');}}
  const warn=(message:string)=>{setError(message);setSuccess('');};
  const formSubmit=(op:string, payload:Record<string,unknown>, after?: (res:Record<string,unknown>)=>void) => action(op,payload,res=>{if(after)after(res);else close();});
  const clearNotifications=()=>{setError('');setSuccess('');};

  if(auth===null)return <div className="splash"><div className="brandSign">A</div><b>ABMIL POSE</b><p>Chargement de votre espace…</p></div>;
  if(!auth.authenticated&&!demo){
    return <div className="loginPage"><div className="loginAside"><div className="loginLogo"><div className="brandSign">A</div><span>ABMIL <b>POSE</b></span></div><div className="loginVisual"><span className="eyebrow light">WORKFORCE MANAGEMENT</span><h1>Vos chantiers.<br/>Votre équipe.<br/><em>Un seul outil.</em></h1><p>Planning, pointage et relevés d’heures — conçus pour le terrain.</p></div><div className="loginFoot">ABMIL POSE · Logiciel interne</div></div><div className="loginMain"><div className="authCard"><div className="mobileLogo"><div className="brandSign">A</div><b>ABMIL POSE</b></div>{!auth.configured?<><div className="authMark"><Settings2 size={22}/></div><h2>Installation Netlify + Neon</h2><p>Pour activer les comptes et les pointages partagés, connectez Neon PostgreSQL et configurez les variables secrètes sur Netlify comme indiqué dans le guide.</p><div className="hint">Vous pouvez explorer le prototype avec des données fictives sans aucune configuration.</div><button className="btn primary wide" onClick={()=>{setDemo(true);setDemoRole('admin');setPage('planning');}}>Ouvrir la démonstration <ArrowRight size={18}/></button></>:auth.setupRequired?<><div className="authMark"><ShieldCheck size={22}/></div><h2>Activer l’espace direction</h2><p>Première installation : créez le compte administrateur.</p><form onSubmit={e=>{e.preventDefault();action('setup',setup);}}><label>Nom du responsable<input required value={setup.name} onChange={e=>setSetup({...setup,name:e.target.value})} placeholder="Direction ABMIL"/></label><label>Clé de première installation<input required type="password" value={setup.key} onChange={e=>setSetup({...setup,key:e.target.value})}/></label><label>Mot de passe (12 caractères min.)<input required minLength={12} type="password" value={setup.password} onChange={e=>setSetup({...setup,password:e.target.value})}/></label><button className="btn primary wide" disabled={busy}>Créer le compte direction</button></form></>:isInvite?<><div className="authMark"><UserRound size={23}/></div><h2>Bienvenue chez ABMIL Pose</h2><p>Choisissez votre code personnel à 6 chiffres. Il servira pour vos prochaines connexions.</p><form onSubmit={e=>{e.preventDefault();action('activate',{token:inviteToken,pin:activationPin},()=>{window.history.replaceState(null,'',window.location.pathname);setInviteToken('');});}}><label>Votre code PIN à 6 chiffres<input inputMode="numeric" type="password" required pattern="[0-9]{6}" maxLength={6} placeholder="••••••" value={activationPin} onChange={e=>setActivationPin(e.target.value.replace(/\D/g,'').slice(0,6))}/></label><button className="btn primary wide" disabled={busy}>Activer mon accès <ArrowRight size={18}/></button></form><button className="subtleLink" onClick={()=>setInviteToken('')}>J’ai déjà un compte</button></>:<><div className="authMark"><LockKeyhole size={22}/></div><h2>Bienvenue</h2><p>Connectez-vous à votre espace ABMIL Pose.</p><div className="roleSwitch"><button className={loginRole==='worker'?'selected':''} onClick={()=>setLoginRole('worker')}>Salarié</button><button className={loginRole==='admin'?'selected':''} onClick={()=>setLoginRole('admin')}>Direction</button></div><form onSubmit={e=>{e.preventDefault();if(loginRole==='admin')action('login',{role:'admin',password:loginPassword},()=>setPage('planning'));else action('login',{role:'worker',code:loginCode,pin:loginPin},()=>setPage('dashboard'));}}>{loginRole==='worker'?<><label>Code salarié<input required autoCapitalize="characters" placeholder="Ex. 4E8A92CB" value={loginCode} onChange={e=>setLoginCode(e.target.value.toUpperCase())}/></label><label>Code PIN<input required type="password" inputMode="numeric" maxLength={6} pattern="[0-9]{6}" placeholder="6 chiffres" value={loginPin} onChange={e=>setLoginPin(e.target.value.replace(/\D/g,'').slice(0,6))}/></label></>:<label>Mot de passe direction<input required type="password" placeholder="Votre mot de passe" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)}/></label>}<button disabled={busy} className="btn primary wide">Se connecter <ArrowRight size={18}/></button></form>{process.env.NODE_ENV!=='production'&&<button className="subtleLink" onClick={()=>{setDemo(true);setDemoRole('admin');setPage('planning');clearNotifications();}}>Explorer la démonstration</button>}</>}{error&&<p className="alert error"><CircleAlert size={15}/>{error}</p>}{auth.error&&<p className="alert error">{auth.error}</p>}</div></div></div>;
  }

  return <div className="appShell">
    <aside className={'sidebar '+(mobileMenu?'open':'')}>
      <div className="sidebarBrand"><div className="brandSign">A</div><div className="brandText"><b>ABMIL <span>POSE</span></b><small>WORKFORCE OS</small></div><button className="sideClose" onClick={()=>setMobileMenu(false)}><X size={18}/></button></div>
      <div className="sidebarCaption">{admin?'GESTION D’ÉQUIPE':'MON ESPACE'}</div>
      <nav>{(admin?NAV:[{id:'dashboard',label:'Mon pointage',icon:Clock3},{id:'planning',label:'Mon planning',icon:CalendarDays},{id:'punches',label:'Mes heures',icon:ClipboardCheck},{id:'absences',label:'Mes absences',icon:CalendarOff}]).map(item=><button key={item.id} className={page===item.id?'active':''} onClick={()=>{setPage(item.id);setMobileMenu(false);clearNotifications();}}><item.icon size={19}/>{item.label}{item.id==='absences'&&admin&&data?.absences.filter(x=>x.status==='pending').length?<span className="notification">{data?.absences.filter(x=>x.status==='pending').length}</span>:null}</button>)}</nav>
      <div className="sideFooter"><div className="currentUser"><Avatar name={me?.name||'Utilisateur'}/><div><strong>{me?.name}</strong><small>{admin?'Administrateur':'Salarié'}</small></div></div>{demo?<button className="sideLink" onClick={()=>{setDemoRole(admin?'worker':'admin');setPage('dashboard');clearNotifications();}}><Users size={17}/> Voir l’espace {admin?'salarié':'direction'}</button>:null}<button className="sideLink" onClick={()=>{if(demo){setDemo(false);setPage('dashboard');}else action('logout');}}><LogOut size={17}/>{demo?'Quitter la démo':'Déconnexion'}</button></div>
    </aside>
    {mobileMenu&&<div className="mobileOverlay" onClick={()=>setMobileMenu(false)}/>}
    <div className="workspace"><header className="topbar"><button className="menuToggle" onClick={()=>setMobileMenu(true)}><Menu size={22}/></button><div className="crumb">Espace de travail <span> / </span> <strong>{(admin?NAV:[{id:'dashboard',label:'Mon pointage'},{id:'planning',label:'Mon planning'},{id:'punches',label:'Mes heures'},{id:'absences',label:'Mes absences'}]).find(n=>n.id===page)?.label}</strong></div><div className="topActions">{demo?<Tag kind="warning">DÉMONSTRATION</Tag>:connection==='offline'?<Tag kind="danger">HORS LIGNE</Tag>:<Tag kind="ok">CONNECTÉ</Tag>}<Avatar name={me?.name||'ABMIL'}/></div></header>
      <div className="mainContent">
        {connection==='offline'&&!demo&&<div className="alert error"><CircleAlert size={18}/>Connexion interrompue. Les nouveaux pointages sont indisponibles. Vérifiez le dernier pointage confirmé avant de réessayer ; en cas de doute, signalez-le à la direction. Réessayez après le retour du réseau.<button onClick={refresh}><RefreshCw size={16}/></button></div>}
        {demo&&<div className="demoBanner"><CircleAlert size={17}/><span>Mode démo : noms et chantiers fictifs, données uniquement dans cet onglet. Les invitations ne sont pas réellement envoyées.</span></div>}
        {!admin&&<div className="workerBanner"><div><b>Votre espace personnel</b><span>{me?.name} · Code : {me?.code}</span></div><ShieldCheck size={22}/></div>}
        {error&&<div className="alert error"><CircleAlert size={18}/>{error}<button onClick={()=>setError('')}><X size={15}/></button></div>}
        {success&&<div className="alert success"><Check size={18}/>{success}<button onClick={()=>setSuccess('')}><X size={15}/></button></div>}
        {page==='dashboard' && (admin ? <>
          <div className="pageHeading"><div><span className="eyebrow">VUE D’ENSEMBLE</span><h1>Bonjour, direction <span className="sun">✳</span></h1><p>Votre équipe et vos chantiers, en un coup d’œil.</p></div><button className="btn primary" onClick={()=>openShift()}><Plus size={18}/> Nouvelle affectation</button></div>
          <div className="statsGrid"><Stat icon={Clock3} title="Heures planifiées" value={decimal(visibleAssignments.reduce((n,a)=>n+plannedNet(a),0))+' h'} foot="Cette semaine"/><Stat icon={Users} title="Ouvriers affectés" value={String(new Set(visibleAssignments.map(a=>a.workerId)).size)} foot={(data?.employees.length||0)+' salariés au total'}/><Stat icon={HardHat} title="Chantiers actifs" value={String(data?.sites.filter(s=>s.active).length||0)} foot="Configurés dans le planning"/><Stat icon={ClipboardCheck} title="Heures à valider" value={String(data?.punches.filter(p=>p.outAt&&!p.approved&&!p.voided).length||0)} foot="Pointages terminés"/></div>
          <section className="panel liveAttendance"><div className="panelHeader"><div><h2>Présences en direct</h2><p>Actualisation automatique toutes les 30 secondes · chantier déclaré par le salarié</p></div><Tag kind={teamActive.length?'ok':'muted'}>{teamActive.length} présent(s)</Tag></div>
          {teamActive.length?<div className="attendanceGrid">{teamActive.map(p=><div className="attendanceItem" key={p.id}><Avatar name={employee(p.workerId)?.name||'?'} /><div><b>{employee(p.workerId)?.name}</b><small>{site(p.siteId)?.name} · {site(p.siteId)?.city}</small><small>Arrivé à {fmtTime(p.inAt)}</small></div><Tag kind={p.status==='paused'?'warning':'ok'}>{p.status==='paused'?'En pause':'Au travail'}</Tag></div>)}</div>:<p className="attendanceEmpty">Aucun salarié n’a de pointage ouvert en ce moment.</p>}</section>
          <div className="dualGrid"><section className="panel"><div className="panelHeader"><div><h2>Cette semaine</h2><p>{labelDate(dayKeys[0])} — {labelDate(dayKeys[6])}</p></div><button className="textAction" onClick={()=>setPage('planning')}>Planning <ArrowRight size={16}/></button></div><div className="weekOverview">{dayKeys.slice(0,5).map((day,i)=><div className="overviewDay" key={day}><div className="dayTile"><small>{DAYS[i]}</small><strong>{toDate(day).getDate()}</strong></div><div><b>{data?.assignments.filter(x=>x.date===day).length||0} affectations</b><small>{new Set(data?.assignments.filter(x=>x.date===day).map(x=>x.siteId)).size} chantier(s)</small></div><div className="circleStack">{data?.assignments.filter(x=>x.date===day).slice(0,3).map(x=><Avatar key={x.id} name={employee(x.workerId)?.name||'?'} />)}</div></div>)}</div></section>
          <section className="panel"><div className="panelHeader"><div><h2>Chantiers</h2><p>État des interventions</p></div><button className="textAction" onClick={()=>setPage('sites')}>Tout voir <ArrowRight size={16}/></button></div><div className="overviewSites">{data?.sites.slice(0,5).map(s=><div key={s.id} className="overviewSite"><div className="workIcon"><HardHat size={21}/></div><div><b>{s.name}</b><small><MapPin size={13}/>{s.city} · {s.client}</small></div><Tag kind={s.active?'ok':'muted'}>{s.active?'Actif':'Archivé'}</Tag></div>)}{!data?.sites.length&&<BigBlank icon={HardHat} title="Aucun chantier" detail="Ajoutez votre premier chantier pour commencer."/>}</div></section></div>
        </> : <>
          <div className="pageHeading workerHeading"><div><span className="eyebrow">POINTAGE DU JOUR</span><h1>Bonjour {me?.name?.split(' ')[0]} 👋</h1><p>{new Date(now).toLocaleDateString('fr-FR',{timeZone:'Europe/Paris',weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p></div></div>
          <div className="workerClockLayout"><div className="clockMain"><section className="workerSitePanel"><span className="sectionOverline">VOTRE CHANTIER</span>{activeShift?<><div className="workerSiteIcon"><HardHat size={26}/></div><h2>{site(activeShift.siteId)?.name}</h2><p><MapPin size={17}/>{site(activeShift.siteId)?.city}</p><div className="shiftStrip"><Clock3 size={17}/> Horaire prévu : <strong>{activeShift.start} – {activeShift.end}</strong></div>{activeShift.note&&<p className="shiftNote">Consigne : {activeShift.note}</p>}{availableShifts.length>1&&!livePunch?<label className="formField">Choisir le créneau<select value={activeShift.id} onChange={e=>setChosenShift(e.target.value)}>{availableShifts.map(a=><option key={a.id} value={a.id}>{site(a.siteId)?.name} · {a.start}–{a.end}</option>)}</select></label>:null}</>:<BigBlank icon={CalendarDays} title="Aucun chantier aujourd’hui" detail="Le responsable doit vous affecter à un chantier avant de pouvoir pointer."/>}</section>
          <section className="clockAction">
            <span className="sectionOverline">VOTRE STATUT</span>
            <div className="clockSteps" aria-label="Étapes du pointage">{['Arrivée','Pause','Reprise','Départ'].map((step,i)=><span key={step} className={clockPhase===i?'current':clockPhase>i?'past':''}>{i+1}. {step}</span>)}</div>
            <div className={'clockStatus '+(livePunch?'active':'')}><span className="statusDot"/>{!livePunch?'En attente de pointage':livePunch.status==='paused'?'Vous êtes en pause':'Travail en cours'}</div>
            {livePunch?<div className="clockSince">Arrivée enregistrée à <strong>{fmtTime(livePunch.inAt)}</strong></div>:<p className="clockHint">Appuyez une fois pour enregistrer votre arrivée.</p>}
            <div className="clockControlGroup">
              {!livePunch?(finishedToday?<div className="clockDone"><Check size={24}/><strong>Tous vos créneaux sont terminés</strong><span>Votre responsable pourra consulter et valider les heures.</span></div>:<button className="clockButton start" disabled={busy||connection==='offline'||!activeShift} onClick={()=>action('clockIn',{assignmentId:activeShift?.id})}><Play size={27} fill="currentColor"/> COMMENCER LE TRAVAIL</button>):
              livePunch.status==='paused'?<button className="clockButton start" disabled={busy||connection==='offline'} onClick={()=>action('pauseEnd')}><Play size={27} fill="currentColor"/> REPRENDRE LE TRAVAIL</button>:
              <><button className="clockButton pause" disabled={busy||connection==='offline'} onClick={()=>action('pauseStart')}><Clock3 size={26}/> COMMENCER LA PAUSE</button><button className="clockButton end" disabled={busy||connection==='offline'} onClick={()=>{if(window.confirm('Confirmer la fin de votre journée ?'))action('clockOut');}}><Square size={26} fill="currentColor"/> TERMINER LA JOURNÉE</button></>}
            </div>
            <p className="clockFine">Les pauses réellement pointées seront soustraites. Chaque action est enregistrée avec l’heure du serveur.</p>
          </section></div><div className="workerSide"><section className="panel sideStats"><h2>Mon récapitulatif</h2><div><span>Heures planifiées cette semaine</span><strong>{decimal(daysHours(me?.id||''))} h</strong></div><div><span>Aujourd’hui (en cours inclus)</span><strong>{decimal(todayRecords.filter(p=>p.workerId===me?.id).reduce((n,p)=>n+worked(p),0)+(livePunch?runningWorked(livePunch):0))} h</strong></div><div><span>Cette semaine</span><strong>{decimal((data?.punches||[]).filter(p=>p.workerId===me?.id&&p.outAt&&actualWeekKeys.includes(p.workDate||p.inAt.slice(0,10))).reduce((n,p)=>n+worked(p),0))} h</strong></div><div><span>Ce mois</span><strong>{decimal(monthRecords.filter(p=>p.workerId===me?.id).reduce((n,p)=>n+worked(p),0))} h</strong></div><div><span>Total enregistré</span><strong>{decimal((data?.punches||[]).filter(p=>p.workerId===me?.id).reduce((n,p)=>n+worked(p),0))} h</strong></div><div><span>Pointages non validés</span><strong>{data?.punches.filter(p=>p.workerId===me?.id&&p.outAt&&!p.approved).length||0}</strong></div></section><section className="panel sideReminder"><ShieldCheck size={24}/><h2>Simple et sécurisé</h2><p>Vos heures sont enregistrées. Votre responsable les vérifie et valide pour le relevé du chantier.</p></section></div></div>
        </>)}

        {page==='planning'&&<>
          <div className="pageHeading planningHeading">
            <div><span className="eyebrow">{admin?'PLANIFICATION DES CHANTIERS':'MON ORGANISATION'}</span><h1>{admin?'Planning du personnel':'Mon planning'}</h1><p>{admin?'Organisez les équipes, ajustez les affectations et vérifiez la couverture des chantiers.':'Retrouvez les jours et les chantiers où vous êtes attendu.'}</p></div>
            {admin&&<button className="btn primary" onClick={()=>openShift()}><Plus size={18}/> Nouveau créneau</button>}
          </div>
          <section className="panel planPanel shiftbasePlan">
            <div className="planToolbar">
              <div className="planningPeriod"><span className="eyebrow">SEMAINE DE TRAVAIL</span><h2>{labelDate(dayKeys[0])} — {labelDate(dayKeys[6])} <span className="planningYear">{week.getFullYear()}</span></h2></div>
              <div className="weekNav" aria-label="Changer de semaine"><button aria-label="Semaine précédente" onClick={()=>setWeek(plusDays(week,-7))}><ChevronLeft size={18}/></button><button onClick={()=>setWeek(getMonday(toDate(today())))}>Cette semaine</button><button aria-label="Semaine suivante" onClick={()=>setWeek(plusDays(week,7))}><ChevronRight size={18}/></button></div>
            </div>
            {admin&&<div className="planFilters">
              <div className="viewTabs" role="group" aria-label="Regrouper le planning"><button className={planningView==='team'?'selected':''} onClick={()=>setPlanningView('team')}><Users size={16}/> Par salarié</button><button className={planningView==='sites'?'selected':''} onClick={()=>setPlanningView('sites')}><HardHat size={16}/> Par chantier</button></div>
              <div className="scheduleControls"><label className="siteFilter"><Settings2 size={16}/><span>Chantier</span><select aria-label="Filtrer les chantiers" value={planningSiteFilter} onChange={e=>setPlanningSiteFilter(e.target.value)}><option value="all">Tous les chantiers</option>{data?.sites.map(s=><option key={s.id} value={s.id}>{s.name} · {s.city}</option>)}</select></label><span className="planningCount">{planningAssignments.length} créneau{planningAssignments.length>1?'x':''}</span></div>
            </div>}
            <div className="scheduleSummary"><span><CalendarDays size={16}/> {new Set(planningAssignments.map(a=>a.workerId)).size} salarié(s) planifié(s)</span><span><HardHat size={16}/> {new Set(planningAssignments.map(a=>a.siteId)).size} chantier(s)</span><span><Clock3 size={16}/> {decimal(planningAssignments.reduce((n,a)=>n+plannedNet(a),0))} h planifiées</span></div>
            <div className="planScroller"><div className="planMatrix">
              <div className="planHead first">{admin&&planningView==='sites'?'CHANTIER':'SALARIÉ'}</div>
              {dayKeys.map((d,i)=><div key={d} className={'planHead '+(d===today()?'isToday':'')}><small>{DAYS[i]}</small><b>{toDate(d).getDate()}</b>{d===today()&&<i>Aujourd’hui</i>}</div>)}
              {admin&&planningView==='sites'?data?.sites.filter(s=>s.active&&(planningSiteFilter==='all'||s.id===planningSiteFilter)).map(ch=><div className="planRow" key={ch.id}>
                <div className="personCell sitePersonCell"><div className={'siteInitial color-'+siteColor(ch.id,data?.sites||[])}><HardHat size={18}/></div><div><b>{ch.name}</b><small>{ch.city} · {ch.client}</small></div></div>
                {dayKeys.map(d=><div className="planCell" key={d}>
                  {planningAssignments.filter(a=>a.siteId===ch.id&&a.date===d).map(a=><div className={'appointment color-'+siteColor(ch.id,data?.sites||[])} key={a.id}><b>{employee(a.workerId)?.name}</b><small>{a.start} – {a.end}</small><button aria-label="Supprimer le créneau" title="Supprimer le créneau" onClick={()=>{if(window.confirm('Supprimer cette affectation ?'))action('removeAssignment',{assignmentId:a.id});}}><X size={13}/></button></div>)}
                  <button className="cellAdd" onClick={()=>{setShiftForm({workerId:'',siteId:ch.id,date:d,start:ch.start,end:ch.end,note:''});openModal('shift');}} title="Affecter un salarié"><Plus size={16}/></button>
                </div>)}
              </div>):(admin?data?.employees:data?.employees.filter(e=>e.id===me?.id))?.map(w=><div className="planRow" key={w.id}>
                <div className="personCell"><Avatar name={w.name}/><div><b>{w.name}</b><small>{w.role} <span className="personHours">· {decimal(planningAssignments.filter(a=>a.workerId===w.id).reduce((n,a)=>n+plannedNet(a),0))} h</span></small></div></div>
                {dayKeys.map(d=><div className="planCell" key={d}>
                  {planningAssignments.filter(a=>a.workerId===w.id&&a.date===d).map(a=><div className={'appointment color-'+siteColor(a.siteId,data?.sites||[])} key={a.id}><b>{site(a.siteId)?.name}</b><small>{a.start} – {a.end}</small>{admin&&<button aria-label="Supprimer le créneau" title="Supprimer le créneau" onClick={()=>{if(window.confirm('Supprimer cette affectation ?'))action('removeAssignment',{assignmentId:a.id});}}><X size={13}/></button>}</div>)}
                  {admin&&<button className="cellAdd" onClick={()=>openShift(d,w.id)} title="Ajouter une affectation"><Plus size={16}/></button>}
                </div>)}
              </div>)}
            </div></div>
            {!admin&&<div className="workerWeekList">{dayKeys.map((d,i)=>{const shifts=planningAssignments.filter(a=>a.workerId===me?.id&&a.date===d);return <div className="workerWeekDay" key={d}><div className={'workerWeekDayDate '+(d===today()?'current':'')}><small>{DAYS[i]}</small><b>{toDate(d).getDate()}</b></div><div className="workerWeekShifts">{shifts.length?shifts.map(a=><div key={a.id} className={'workerWeekEntry color-'+siteColor(a.siteId,data?.sites||[])}><strong>{site(a.siteId)?.name}</strong><small><MapPin size={12}/>{site(a.siteId)?.city} · {a.start} – {a.end}</small></div>):<span className="workerOff">Repos / non planifié</span>}</div></div>;})}</div>}
            <div className="planningLegend"><div className="legendLabel">{admin?'Codes couleur des chantiers':'Vos affectations'}</div><div className="legendItems">{data?.sites.filter(s=>planningSiteFilter==='all'||s.id===planningSiteFilter).map(s=><span key={s.id}><i className={'legendDot color-'+siteColor(s.id,data?.sites||[])}/>{s.name}</span>)}</div></div>
            <div className="tableFoot">{admin?'Les blocs indiquent le chantier et les horaires prévus. Cliquez sur + pour affecter un salarié.':'Les horaires affichés sont prévisionnels. Seuls les pointages réels déterminent les heures travaillées.'}</div>
          </section>
        </>}

        {page==='sites'&&admin&&<><div className="pageHeading"><div><span className="eyebrow">PARAMÉTRAGE PAR CHANTIER</span><h1>Chantiers</h1><p>Chaque chantier possède ses horaires et sa pause prévisionnelle.</p></div><button className="btn primary" onClick={()=>openSite()}><Plus size={18}/> Nouveau chantier</button></div><div className="siteCards">{data?.sites.map(s=><section className="siteCard" key={s.id}><div className="siteCardHeader"><div className="workIcon large"><HardHat size={24}/></div><Tag kind={s.active?'ok':'muted'}>{s.active?'Actif':'Archivé'}</Tag></div><h2>{s.name}</h2><p className="location"><MapPin size={16}/>{s.city}</p><div className="siteDetails"><div><span>Client</span><b>{s.client}</b></div><div><span>Horaires habituels</span><b>{s.start} – {s.end}</b></div><div><span>Pause déduite</span><b>{s.breakMinutes} min</b></div><div><span>Temps net prévu</span><b>{decimal(Math.max(0,range(s.start,s.end)-s.breakMinutes))} h</b></div></div><button className="btn outline wide" onClick={()=>openSite(s)}><Pencil size={16}/> Modifier les règles</button></section>)}</div>{!data?.sites.length&&<BigBlank icon={HardHat} title="Aucun chantier configuré" detail="Créez un chantier avec ses horaires, son client et sa pause."/>}</>}

        {page==='team'&&admin&&<><div className="pageHeading"><div><span className="eyebrow">GESTION DE L’ÉQUIPE</span><h1>Salariés</h1><p>Créez un accès personnel pour chaque membre.</p></div><button className="btn primary" onClick={()=>{setWorkerForm(initialWorker);openModal('worker');}}><Plus size={18}/> Ajouter un salarié</button></div><section className="panel"><div className="listToolbar"><div className="searchBox"><Search size={18}/><input placeholder="Rechercher un salarié..." value={filter} onChange={e=>setFilter(e.target.value)}/></div><span>{data?.employees.length||0} salariés</span></div><div className="employeeList">{data?.employees.filter(w=>w.name.toLowerCase().includes(filter.toLowerCase())).map(w=><div className="employeeRow" key={w.id}><Avatar name={w.name} size="large"/><div className="employeeName"><b>{w.name}</b><small>{w.role} · Code {w.code}</small></div><div className="employeeStatus"><Tag kind={!w.enabled?'danger':w.activated?'ok':'warning'}>{!w.enabled?'Désactivé':w.activated?'Compte actif':'À inviter'}</Tag></div><div className="rowActions">{!w.activated&&w.enabled&&<button className="btn outline" onClick={()=>{if(demo){warn('Les liens d’invitation nécessitent le serveur et un serveur configuré.');return;}action('invite',{workerId:w.id},res=>{const url=window.location.origin+'/#invitation='+encodeURIComponent(String(res.token))+'&code='+encodeURIComponent(w.code);setInvitation(url);setInviteCode(w.code);openModal('invite');});}}>Inviter</button>}{w.activated&&w.enabled&&<button className="btn outline small" onClick={()=>{if(!window.confirm('Réinitialiser le PIN de '+w.name+' ? Son accès actuel sera immédiatement désactivé.'))return;action('resetPin',{workerId:w.id},res=>{const url=window.location.origin+'/#invitation='+encodeURIComponent(String(res.token))+'&code='+encodeURIComponent(w.code);setInvitation(url);setInviteCode(w.code);openModal('invite');});}}>Réinitialiser PIN</button>}<button className="iconButton" title={w.enabled?'Désactiver le compte':'Réactiver le compte'} onClick={()=>{if(window.confirm((w.enabled?'Désactiver':'Réactiver')+' '+w.name+' ?'))action('workerToggle',{workerId:w.id});}}><ShieldCheck size={18}/></button></div></div>)}{!data?.employees.length&&<BigBlank icon={Users} title="Aucun salarié" detail="Ajoutez un salarié pour lui attribuer des chantiers et l’inviter."/>}</div></section></>}

           {page==='punches'&&<><div className="pageHeading"><div><span className="eyebrow">{admin?'HEURES RÉELLES':'MON HISTORIQUE'}</span><h1>{admin?'Pointages & relevés':'Mes heures'}</h1><p>{admin?'Validez les heures réellement effectuées avant export.':'Retrouvez vos entrées et sorties enregistrées.'}</p></div>{admin&&<div className="reportButtons"><button className="btn outline" onClick={openManual}><Plus size={18}/> Saisie manuelle</button><button className="btn primary" disabled={busy} onClick={()=>downloadCsv(selectedClient)}><Download size={18}/> Export CSV</button></div>}</div>{admin&&<><div className="statsGrid reduced"><Stat icon={Clock3} title="Heures pointées" value={decimal(totalActual)+' h'} foot="Tous les pointages terminés"/><Stat icon={ClipboardCheck} title="Heures approuvées (semaine)" value={decimal(weekApproved.reduce((n,p)=>n+worked(p),0))+' h'} foot="Exportables cette semaine"/></div><div className="exportBar"><FileSpreadsheet size={21}/><div><b>Relevé d’heures par client</b><small>Seuls les pointages validés de la semaine sont exportés. Fontanel est un regroupement par nom de client, pas un modèle officiel.</small></div><select value={selectedClient} onChange={e=>setSelectedClient(e.target.value)}><option value="Tous">Tous les clients</option>{Array.from(new Set(['Fontanel',...(data?.sites.map(s=>s.client)||[])])).map(c=><option value={c} key={c}>{c}</option>)}</select><div className="reportPeriod"><select aria-label="Période du rapport" value={reportPeriod} onChange={e=>setReportPeriod(e.target.value as 'week'|'month')}><option value="week">Semaine</option><option value="month">Mois</option></select>{reportPeriod==='month'?<input type="month" value={reportMonth} onChange={e=>setReportMonth(e.target.value)}/>:<div className="weekNav"><button onClick={()=>setWeek(plusDays(week,-7))}><ChevronLeft size={18}/></button><span>{labelDate(dayKeys[0])}</span><button onClick={()=>setWeek(plusDays(week,7))}><ChevronRight size={18}/></button></div>}</div></div><div className="finalSheetBar"><div><b>Feuille finale {reportPeriod==='month'?'mensuelle':'hebdomadaire'}</b><small>Pointages validés regroupés par salarié, chantier et semaine, avec le total par jour et les visas de validation.</small></div><button className="btn primary" disabled={busy} onClick={()=>downloadFinalTimesheet(reportPeriod)}><FileSpreadsheet size={18}/> Télécharger la feuille finale {reportPeriod==='month'?'mensuelle':'hebdomadaire'}</button></div><section className="panel timeBreakdown"><div className="panelHeader"><div><h2>Récapitulatif {reportPeriod==='month'?'mensuel':'hebdomadaire'}</h2><p>Heures réelles par salarié · sorties enregistrées, même en attente de validation</p></div></div><div className="hoursTable">{(data?.employees||[]).filter(w=>periodRecords.some(p=>p.workerId===w.id)).map(w=><div className="hoursTableRow" key={w.id}><b>{w.name}</b><span>{new Set(periodRecords.filter(p=>p.workerId===w.id).map(p=>p.workDate)).size} jour(s)</span><strong>{decimal(periodRecords.filter(p=>p.workerId===w.id).reduce((n,p)=>n+worked(p),0))} h</strong></div>)}{!periodRecords.length&&<p className="attendanceEmpty">Aucun pointage terminé sur cette période.</p>}</div></section><section className="panel timeBreakdown"><div className="panelHeader"><div><h2>Heures par jour travaillé</h2><p>Une ligne par salarié et par date, même en cas de plusieurs chantiers</p></div></div><div className="hoursTable">{groupedDaily.map(r=><div className="hoursTableRow" key={r.key}><b>{employee(r.workerId)?.name}<small className="detailDay">{labelDate(r.date)}</small></b><span>{r.count} pointage(s)</span><strong>{decimal(r.minutes)} h</strong></div>)}{!groupedDaily.length&&<p className="attendanceEmpty">Aucune heure enregistrée pour cette période.</p>}</div></section></>}
          <section className="panel"><div className="panelHeader"><div><h2>Historique des pointages</h2><p>{admin?'Contrôle, validation et corrections tracées.':'Vos heures seront validées par la direction.'}</p></div></div><div className="punchList">{data?.punches.filter(p=>!p.voided&&(admin||p.workerId===me?.id)).slice().sort((a,b)=>b.inAt.localeCompare(a.inAt)).map(p=><div className="punchRow" key={p.id}><div className="punchPrimary"><b>{admin?employee(p.workerId)?.name:site(p.siteId)?.name}</b><small>{fmtDate(p.inAt)} · {site(p.siteId)?.name}</small></div><div className="punchTimes"><strong>{fmtTime(p.inAt)} → {p.outAt?fmtTime(p.outAt):'En cours'}</strong><small>{p.outAt?decimal(worked(p))+' h nettes':'Heures en cours'} · pauses réelles {p.breakMinutes} min</small></div><Tag kind={!p.outAt?'warning':p.approved?'ok':'muted'}>{!p.outAt?(p.status==='paused'?'En pause':'En cours'):p.approved?'Validé':'À vérifier'}</Tag>{admin&&<div className="punchActions">{p.outAt&&<button className="btn outline small" onClick={()=>action('punchApprove',{punchId:p.id})}>{p.approved?'Annuler validation':'Valider'}</button>}<button className="iconButton" title="Corriger ou clôturer (motif obligatoire)" onClick={()=>openCorrection(p)}><Pencil size={17}/></button></div>}</div>)}{!data?.punches.length&&<BigBlank icon={Clock3} title="Aucun pointage pour le moment" detail="Les entrées et sorties apparaîtront ici dès qu’un salarié aura pointé."/>}</div></section></>}

        {page==='absences'&&<><div className="pageHeading"><div><span className="eyebrow">CONGÉS & INDISPONIBILITÉS</span><h1>{admin?'Absences des salariés':'Mes absences'}</h1><p>{admin?'Approuvez ou refusez les demandes de l’équipe.':'Demandez une absence directement depuis votre téléphone.'}</p></div><button className="btn primary" onClick={()=>{setAbsenceForm({workerId:admin?data?.employees[0]?.id||'':me?.id||'',from:today(),to:today(),reason:'Congés'});openModal('absence');}}><Plus size={18}/> Nouvelle demande</button></div><section className="panel absencePanel">{data?.absences.map(a=><div key={a.id} className="absenceRow"><div className="workIcon"><CalendarDays size={20}/></div><div className="absenceInfo"><b>{admin?employee(a.workerId)?.name:a.reason}</b><small>{labelDate(a.from)} — {labelDate(a.to)} · {a.reason}</small></div><Tag kind={a.status==='approved'?'ok':a.status==='rejected'?'danger':'warning'}>{a.status==='approved'?'Acceptée':a.status==='rejected'?'Refusée':'En attente'}</Tag>{admin&&a.status==='pending'&&<div className="rowActions"><button className="btn outline small" onClick={()=>action('absenceResolve',{absenceId:a.id,status:'approved'})}>Accepter</button><button className="btn outline small" onClick={()=>action('absenceResolve',{absenceId:a.id,status:'rejected'})}>Refuser</button></div>}</div>)}{!data?.absences.length&&<BigBlank icon={CalendarOff} title="Aucune demande" detail="Les absences demandées par les salariés s’afficheront ici."/>}</section></>}
      </div>
    </div>
    {modal&&<div className="modalShade" onClick={close}><div className="dialog" role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()}><div className="dialogHead"><div><span className="eyebrow">ABMIL POSE</span><h2>{modal==='worker'?'Ajouter un salarié':modal==='site'?(editingSiteId?'Modifier le chantier':'Nouveau chantier'):modal==='shift'?'Nouvelle affectation':modal==='absence'?'Demander une absence':modal==='correction'?'Corriger / clôturer un pointage':modal==='manual'?'Saisir une journée oubliée':'Invitation salarié'}</h2></div><button className="iconButton" onClick={close}><X size={21}/></button></div>
      {modal==='worker'&&<form className="form" onSubmit={e=>{e.preventDefault();formSubmit('addWorker',workerForm,()=>{close();setWorkerForm(initialWorker);});}}><label>Nom et prénom<input required maxLength={100} value={workerForm.name} onChange={e=>setWorkerForm({...workerForm,name:e.target.value})} placeholder="Ex. Pierre Martin"/></label><label>Fonction<input required maxLength={60} value={workerForm.role} onChange={e=>setWorkerForm({...workerForm,role:e.target.value})} placeholder="Poseur, chef d’équipe..."/></label><div className="hint">Le salarié recevra un code personnel et un lien d’activation lors de l’invitation.</div><button className="btn primary wide" disabled={busy}>Ajouter ce salarié</button></form>}
      {modal==='site'&&<form className="form" onSubmit={e=>{e.preventDefault();formSubmit('siteSave',{...siteForm,id:editingSiteId||undefined});}}><div className="formGrid"><label>Nom du chantier<input required value={siteForm.name} onChange={e=>setSiteForm({...siteForm,name:e.target.value})} placeholder="Ex. Résidence du Parc"/></label><label>Ville<input required value={siteForm.city} onChange={e=>setSiteForm({...siteForm,city:e.target.value})} placeholder="Ex. Cergy"/></label></div><label>Client / donneur d’ordre<input required value={siteForm.client} onChange={e=>setSiteForm({...siteForm,client:e.target.value})} placeholder="Ex. Fontanel"/></label><div className="formGrid"><label>Début habituel<input type="time" required value={siteForm.start} onChange={e=>setSiteForm({...siteForm,start:e.target.value})}/></label><label>Fin habituelle<input type="time" required value={siteForm.end} onChange={e=>setSiteForm({...siteForm,end:e.target.value})}/></label></div><label>Pause prévue (minutes)<input type="number" min="0" max="240" required value={siteForm.breakMinutes} onChange={e=>setSiteForm({...siteForm,breakMinutes:Number(e.target.value)})}/></label><div className="hint">La pause indiquée sert aux horaires prévus. Les heures réelles déduisent uniquement les pauses enregistrées par le salarié.</div><button className="btn primary wide" disabled={busy}>Enregistrer le chantier</button></form>}
      {modal==='shift'&&<form className="form" onSubmit={e=>{e.preventDefault();formSubmit('assign',shiftForm);}}><label>Salarié<select required value={shiftForm.workerId} onChange={e=>setShiftForm({...shiftForm,workerId:e.target.value})}><option value="">Choisir un salarié</option>{data?.employees.filter(w=>w.enabled).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label>Chantier<select required value={shiftForm.siteId} onChange={e=>{const s=site(e.target.value);setShiftForm({...shiftForm,siteId:e.target.value,start:s?.start||shiftForm.start,end:s?.end||shiftForm.end});}}><option value="">Choisir un chantier</option>{data?.sites.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name} · {s.city}</option>)}</select></label><label>Date<input required type="date" value={shiftForm.date} onChange={e=>setShiftForm({...shiftForm,date:e.target.value})}/></label><div className="formGrid"><label>Début<input required type="time" value={shiftForm.start} onChange={e=>setShiftForm({...shiftForm,start:e.target.value})}/></label><label>Fin<input required type="time" value={shiftForm.end} onChange={e=>setShiftForm({...shiftForm,end:e.target.value})}/></label></div><label>Consigne (facultatif)<textarea rows={2} value={shiftForm.note} onChange={e=>setShiftForm({...shiftForm,note:e.target.value})} placeholder="Instructions du jour..."/></label><button className="btn primary wide" disabled={busy}>Affecter au chantier</button></form>}
      {modal==='absence'&&<form className="form" onSubmit={e=>{e.preventDefault();formSubmit('absenceAdd',absenceForm);}}>{admin&&<label>Salarié<select value={absenceForm.workerId} onChange={e=>setAbsenceForm({...absenceForm,workerId:e.target.value})}>{data?.employees.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>}<div className="formGrid"><label>Du<input type="date" required value={absenceForm.from} onChange={e=>setAbsenceForm({...absenceForm,from:e.target.value})}/></label><label>Au<input type="date" required min={absenceForm.from} value={absenceForm.to} onChange={e=>setAbsenceForm({...absenceForm,to:e.target.value})}/></label></div><label>Motif<select value={absenceForm.reason} onChange={e=>setAbsenceForm({...absenceForm,reason:e.target.value})}><option>Congés</option><option>Indisponibilité</option><option>Rendez-vous</option><option>Autre</option></select></label><button className="btn primary wide" disabled={busy}>Envoyer la demande</button></form>}
      {modal==='correction'&&<form className="form" onSubmit={e=>{e.preventDefault();formSubmit('punchCorrect',{...correctionForm,inAt:new Date(correctionForm.inAt).toISOString(),outAt:new Date(correctionForm.outAt).toISOString()});}}><div className="formGrid"><label>Entrée<input type="datetime-local" required value={correctionForm.inAt} onChange={e=>setCorrectionForm({...correctionForm,inAt:e.target.value})}/></label><label>Sortie<input type="datetime-local" required value={correctionForm.outAt} onChange={e=>setCorrectionForm({...correctionForm,outAt:e.target.value})}/></label></div><label>Pause réelle totale (min)<input type="number" min="0" max="240" required value={correctionForm.breakMinutes} onChange={e=>setCorrectionForm({...correctionForm,breakMinutes:Number(e.target.value)})}/></label><label>Motif de correction (obligatoire)<textarea required minLength={5} value={correctionForm.reason} onChange={e=>setCorrectionForm({...correctionForm,reason:e.target.value})} placeholder="Ex. Oubli de pointage de sortie"/></label><div className="hint">Pour une sortie oubliée, indiquez l’heure réelle de départ, les pauses et le motif. Toute clôture ou correction sera journalisée, puis devra être validée avant export.</div><button className="btn primary wide" disabled={busy}>Enregistrer la correction</button></form>}
      {modal==='manual'&&<form className="form" onSubmit={e=>{e.preventDefault();formSubmit('manualPunch',{...manualForm,inAt:new Date(manualForm.inAt).toISOString(),outAt:new Date(manualForm.outAt).toISOString()});}}>
      <label>Affectation prévue<select required value={manualForm.assignmentId} onChange={e=>{const a=data?.assignments.find(a=>a.id===e.target.value);setManualForm({...manualForm,assignmentId:e.target.value,inAt:a?`${a.date}T${a.start}`:'',outAt:a?`${a.date}T${a.end}`:'',breakMinutes:a?(site(a.siteId)?.breakMinutes||0):0});}}><option value="">Choisir une affectation</option>{data?.assignments.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(a=><option key={a.id} value={a.id}>{a.date} · {employee(a.workerId)?.name} · {site(a.siteId)?.name}</option>)}</select></label>
      <div className="formGrid"><label>Entrée<input type="datetime-local" required value={manualForm.inAt} onChange={e=>setManualForm({...manualForm,inAt:e.target.value})}/></label><label>Sortie<input type="datetime-local" required value={manualForm.outAt} onChange={e=>setManualForm({...manualForm,outAt:e.target.value})}/></label></div>
      <label>Pause réelle totale (minutes)<input type="number" min="0" max="1440" required value={manualForm.breakMinutes} onChange={e=>setManualForm({...manualForm,breakMinutes:Number(e.target.value)})}/></label>
      <label>Motif obligatoire<textarea required minLength={5} value={manualForm.reason} onChange={e=>setManualForm({...manualForm,reason:e.target.value})} placeholder="Ex. Salarié sans réseau, heures confirmées avec le chef de chantier"/></label>
      <div className="hint">Une saisie manuelle n'est possible que si l’affectation n’a pas encore de pointage. Elle reste non validée jusqu’à votre contrôle et sera journalisée.</div>
      <button className="btn primary wide" disabled={busy}>Enregistrer la journée</button></form>}
      {modal==='invite'&&<div className="form"><div className="hint">Envoyez ce lien individuellement au salarié. Il expire après 7 jours et ne peut être utilisé qu’une fois.</div><label>Code salarié<input value={inviteCode} readOnly/></label><label>Lien personnel<textarea rows={4} readOnly value={invitation} onFocus={e=>e.target.select()}/></label><button className="btn primary wide" onClick={copyLink}><Copy size={18}/> Copier l’invitation</button></div>}
      {error&&<div className="alert error inDialog"><CircleAlert size={16}/>{error}</div>}
      </div></div>}
    <div className="bottomNav">{(admin?[NAV[0],NAV[1],NAV[3],NAV[4]]:[{id:'dashboard',label:'Pointer',icon:Clock3},{id:'planning',label:'Planning',icon:CalendarDays},{id:'punches',label:'Heures',icon:ClipboardCheck},{id:'absences',label:'Absences',icon:CalendarOff}]).map(n=><button className={page===n.id?'active':''} key={n.id} onClick={()=>{setPage(n.id);clearNotifications();}}><n.icon size={21}/><span>{n.label}</span></button>)}</div>
  </div>;
}
function Stat({icon:Icon,title,value,foot}:{icon:React.ComponentType<{size?:number}>;title:string;value:string;foot:string}){return <div className="statCard"><div className="statTop"><span>{title}</span><Icon size={19}/></div><strong>{value}</strong><small>{foot}</small></div>;}
