import test from 'node:test';
import assert from 'node:assert/strict';
import { reportBounds } from '../lib/period.ts';
import { csvCell, csvRows, csvHours } from '../lib/csv.ts';
import { finalTimesheetRows, weeklyFinalTimesheetRows } from '../lib/final-timesheet.ts';
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

test('feuille finale mensuelle regroupe par salarié, chantier et semaine avec un récapitulatif', () => {
  const csv = finalTimesheetRows([
    {employee:'Salarié A',site:'Chantier X',day:'2026-06-01',netMinutes:465},
    {employee:'Salarié A',site:'Chantier X',day:'2026-06-02',netMinutes:480},
    {employee:'Salarié A',site:'Chantier Y',day:'2026-06-08',netMinutes:450},
  ],'2026-06','Tous');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Salarié";"Chantier";"Semaine N°";"Du";"Au";"Lundi";"Mardi";"Mercredi";"Jeudi";"Vendredi";"Samedi";"Dimanche";"Total semaine"'));
  assert.ok(csv.includes('"Salarié A";"Chantier X";"23";"01/06/2026";"07/06/2026";"7,75";"8,00"'));
  assert.ok(csv.includes('"Salarié A";"Chantier Y";"24";"08/06/2026"'));
  assert.ok(csv.includes('"TOTAL GÉNÉRAL";"";"23,25"'));
  assert.ok(csv.includes('"01/06/2026 - 30/06/2026"'));
});

test('feuille finale hebdomadaire présente la grille des jours, le total et les visas', () => {
  const csv = weeklyFinalTimesheetRows([
    {employee:'Salarié A',site:'Chantier X',day:'2026-06-01',netMinutes:465},
    {employee:'Salarié A',site:'Chantier X',day:'2026-06-02',netMinutes:480},
  ],'2026-06-03','Tous');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Période";"Semaine n° 23";"Du";"01/06/2026";"Au";"07/06/2026"'));
  assert.ok(csv.includes('"Salarié";"Chantier";"Semaine N°";"Du";"Au";"Lundi";"Mardi";"Mercredi";"Jeudi";"Vendredi";"Samedi";"Dimanche";"Total semaine"'));
  assert.ok(csv.includes('"Salarié A";"Chantier X";"23";"01/06/2026";"07/06/2026";"7,75";"8,00"'));
  assert.ok(csv.includes('"TOTAL HEURES VALIDÉES"'));
  assert.ok(csv.includes('"Visa salarié :'));
});
