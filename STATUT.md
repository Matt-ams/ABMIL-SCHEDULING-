# Statut de livraison — ABMIL Pose Workforce OS V1 bêta

**12 novembre 2026 — candidat pilote, NON homologué pour des pointages salariés réels.**

## Vérifié localement

- 13 tests unitaires passés avec Node.js 22 (durées, pauses multiples, transitions, semaines/mois, CSV, version de session).
- 13 fichiers TS/TSX analysés sans erreur de syntaxe à l'aide du parseur TypeScript.
- Configuration Netlify Next.js fournie; manifeste mobile et ressources statiques présents.

## Non encore vérifié — bloque le passage en production

- Installation complète `npm install`, vérification de types `npm run typecheck` et `npm run build` : dépendances npm inaccessibles dans l'environnement de création.
- Déploiement public Netlify et connexion à Neon : comptes non connectés.
- Migration sur PostgreSQL réelle, authentification, droits par rôle, concurrence 10 téléphones et rejeu de requêtes HTTP.
- Sauvegarde chiffrée et restauration sur une seconde base réelle.
- Tests sur iPhone/Android et réseau mobile intermittent.
- Validation du CSV final par le comptable et règles sociales applicables aux salariés BTP.

## Décision d'exploitation

Tant que les tests de `RECETTE.md` ne sont pas marqués OK sur une vraie base de préproduction, ne pas substituer ce système au registre d'heures existant. Ne jamais considérer une absence de message d'erreur comme une confirmation de pointage : vérifier l'heure retournée par le serveur.
