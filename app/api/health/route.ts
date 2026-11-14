import { NextResponse } from 'next/server';
import { database, isConfigured, withDatabase } from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=withDatabase(async function GET(){
  if(!isConfigured())return NextResponse.json({status:'unconfigured'},{status:503,headers:{'Cache-Control':'no-store'}});
  try{
    const result=await database().query("SELECT CASE WHEN to_regclass('public.work_sessions') IS NOT NULL THEN 1 ELSE 0 END AS ok");
    if(result.rows[0]?.ok!==1)throw new Error('DB response invalid');
    return NextResponse.json({status:'ok',timestamp:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
  }catch{
    return NextResponse.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
});
