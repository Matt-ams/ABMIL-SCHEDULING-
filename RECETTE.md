# ABMIL POSE — RECETTE AVANT UTILISATION RÉELLE

Tous ces tests doivent être effectués sur **Netlify de préproduction**, avec une base Neon de **test séparée**, et de faux noms. Marquer OK/KO, date, appareil, preuve et correctif.

## Phase 1 — compte & sécurité

- [ ] Un visiteur anonyme ne lit aucune heure, salarié ni chantier.
- [ ] Première activation Direction avec une clé secrète correcte; une seconde activation est impossible.
- [ ] Invitation personnelle à usage unique, expiration, PIN de six chiffres, déconnexion.
- [ ] Un salarié ne voit jamais les heures de ses collègues et ne peut pas créer de chantier ni valider un pointage.
- [ ] Après cinq échecs, l'accès est temporairement bloqué.
- [ ] Réinitialiser le PIN depuis la Direction; vérifier que **l'ancien téléphone** doit immédiatement se reconnecter, même après réactivation.
- [ ] Désactiver puis réactiver un salarié; vérifier qu'un ancien cookie n'est pas réutilisable.

## Phase 2 — quatre actions de pointage

- [ ] Sur iPhone et Android : arrivée → pause → reprise → départ.
- [ ] Deux pauses le même jour donnent un total correct. Exemple 07:00 → 15:30 avec 30 min de pause = **8 h 00**.
- [ ] Refus d'un second début si une journée est ouverte; refus d'une sortie pendant une pause.
- [ ] Dix salariés fictifs pointent au même moment; **exactement dix sessions et dix événements d'arrivée** sont stockés.
- [ ] Deux doubles clics / deux requêtes à la même milliseconde n'ouvrent jamais deux sessions pour un salarié.
- [ ] Couper le réseau après avoir appuyé sur Arrivée : aucune réussite fausse. Au retour, le serveur confirme l'état réel; réessayer avec la même clé ne double rien.
- [ ] Pour un salarié affecté sur deux chantiers le même jour, après sortie du premier, le deuxième créneau doit être disponible.
- [ ] Une journée en cours non terminée peut être **clôturée par la Direction**, avec heure de départ et motif; la correction figure au journal d'audit et reste non validée.
- [ ] Les limites des pauses planifiées par chantier n'affectent pas par erreur les heures réelles.

## Phase 3 — heures & comptabilité

- [ ] Comparer chaque heure sur le téléphone, la page Direction et le CSV.
- [ ] 5 journées de 8 heures = **40 heures** dans la synthèse semaine.
- [ ] Les filtres mois/semaine et client « Fontanel » fonctionnent; les journées non approuvées ne sortent pas dans les CSV.
- [ ] Correction motivée d'un pointage validé → statut non validé, non exportable tant que non réapprouvé.
- [ ] Vérifier décembre/janvier, passage d'heure d'été/hiver et février bissextile.
- [ ] Le comptable valide le format final; conserver l'original exporté.

## Phase 4 — exploitation

- [ ] Redéployer, puis vérifier que tous les pointages existent encore (données DB, pas mémoire du serveur).
- [ ] Vérifier la remontée des présences à la Direction après une entrée / pause / reprise en 30 s environ.
- [ ] Vérifier `/api/health`, alarmes d'indisponibilité, quotas Netlify et Neon.
- [ ] Effectuer une **vraie sauvegarde chiffrée et une restauration** sur une DB jetable.
- [ ] Tester la procédure papier `CONTINUITE.md` et la saisie manuelle d'un oubli.
- [ ] Fournir notice RGPD, déterminer responsable des traitements, rétention et accès.
- [ ] Surveiller 2 semaines en parallèle d'un registre de pointage existant avant toute bascule.
