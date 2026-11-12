import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionMinutes, validDate, validTime } from '../lib/time.ts';
import { transition } from '../lib/clock.ts';

test('8h30 de présence, 30min de pause = 8 heures',()=>{
  const r=sessionMinutes('2026-11-12T07:00:00Z','2026-11-12T15:30:00Z',[
    {startAt:'2026-11-12T12:00:00Z',endAt:'2026-11-12T12:30:00Z'}
  ]);
  assert.deepEqual(r,{grossMinutes:510,breakMinutes:30,netMinutes:480});
});
test('plusieurs pauses se cumulent sans doubler le temps',()=>{
  const r=sessionMinutes('2026-11-12T06:00:00Z','2026-11-12T14:00:00Z',[
    {startAt:'2026-11-12T09:00:00Z',endAt:'2026-11-12T09:15:00Z'},
    {startAt:'2026-11-12T12:00:00Z',endAt:'2026-11-12T12:30:00Z'}]);
  assert.equal(r.netMinutes,435);
  assert.equal(r.breakMinutes,45);
});
test('pause ouverte est comptée jusqu’à maintenant sans autoriser un calcul négatif',()=>{
  const r=sessionMinutes('2026-11-12T06:00:00Z','2026-11-12T08:00:00Z',[
    {startAt:'2026-11-12T07:00:00Z'}]);
  assert.equal(r.netMinutes,60);
  assert.throws(()=>sessionMinutes('2026-11-12T07:00:00Z','2026-11-12T08:00:00Z',[],90));
});
test('une pause qui se chevauche est refusée',()=>{
  assert.throws(()=>sessionMinutes('2026-11-12T06:00:00Z','2026-11-12T14:00:00Z',[
    {startAt:'2026-11-12T09:00:00Z',endAt:'2026-11-12T09:30:00Z'},
    {startAt:'2026-11-12T09:15:00Z',endAt:'2026-11-12T09:45:00Z'}]));
});
test('date civile et heure valides y compris rejet des dates impossibles',()=>{
  assert.equal(validDate('2026-02-29'),false);
  assert.equal(validDate('2028-02-29'),true);
  assert.equal(validTime('23:59'),true);
  assert.equal(validTime('24:01'),false);
});
test('parcours complet de pointage de salarié avec deux pauses',()=>{
  let state='idle';
  for(const event of ['clockIn','pauseStart','pauseEnd','pauseStart','pauseEnd','clockOut'])state=transition(state,event);
  assert.equal(state,'completed');
});
test('transitions invalides empêchent les doubles clics et sorties pendant la pause',()=>{
  assert.throws(()=>transition('working','clockIn'));
  assert.throws(()=>transition('paused','clockOut'));
  assert.throws(()=>transition('paused','pauseStart'));
  assert.throws(()=>transition('idle','clockOut'));
  assert.throws(()=>transition('completed','clockOut'));
});
