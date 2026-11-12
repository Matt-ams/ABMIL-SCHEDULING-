import test from 'node:test';
import assert from 'node:assert/strict';
import { reportBounds } from '../lib/period.ts';
import { csvCell, csvRows, csvHours } from '../lib/csv.ts';
import { currentWorkerSession } from '../lib/auth-rules.ts';

test('relevé de semaine du lundi au dimanche (même aux changements d’année)', () => {
  assert.deepEqual(reportBounds('week','2027-01-01'), {start:'2026-12-28',end:'2027-01-03'});
});
test('mois de février bissextile et mois de décembre', () => {
  assert.deepEqual(reportBounds('month','2028-02-20'), {start:'2028-02-01',end:'2028-02-29'});
  assert.deepEqual(reportBounds('month','2026-12-30'), {start:'2026-12-01',end:'2026-12-31'});
});
test('un relevé rejette une date impossible', () => {
  assert.throws(()=>reportBounds('week','2026-02-29'));
});
test('export : neutralise les formules et protège les séparateurs, accents et retours de ligne', () => {
  assert.equal(csvCell('=SUM(1,1)'), '"\'=SUM(1,1)"');
  assert.equal(csvCell(' +cmd'), '"\' +cmd"');
  assert.equal(csvCell('Jean; Dupont'), '"Jean; Dupont"');
  assert.equal(csvCell('A\nB'), '"A B"');
  assert.ok(csvRows([['Salarié','Heures'],['Élodie',8]]).startsWith('\uFEFF'));
});
test('réinitialisation de code révoque les anciennes sessions', () => {
  assert.equal(currentWorkerSession(1,1,true,true),true);
  assert.equal(currentWorkerSession(1,2,true,true),false);
  assert.equal(currentWorkerSession(2,2,false,true),false);
  assert.equal(currentWorkerSession(2,2,true,false),false);
  assert.equal(currentWorkerSession(0,0,true,true),false);
});

test('heures au format décimal français pour le comptable', () => {
  assert.equal(csvHours(480),'8,00');
  assert.equal(csvHours(465),'7,75');
  assert.equal(csvHours(450),'7,50');
  assert.throws(()=>csvHours(-1));
});
