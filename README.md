# ABMIL POSE — WORKFORCE OS V1 (pilote)

**Application interne de planification de chantiers et de pointage pour 5 à 10 salariés.**

> **Statut vérifié :** source prête à être testée, logique unitaire exécutée localement. **Pas encore de build complet, pas de base PostgreSQL connectée, pas de test multi-téléphones ni de déploiement effectif. Ne pas utiliser pour les heures de paie avant la recette.**

## Interface et rôles

### Direction
- Tableau de bord avec salariés pointés en direct (statut travail/pause), chantier **déclaré**, planning hebdomadaire type Shiftbase. Le chantier déclaré n'est pas une vérification GPS.
- Planning en lignes par salarié **ou** par chantier, couleurs par chantier, horaires / pauses prévus propres à chaque chantier.
- Création des salariés (code individuel), invitation à usage unique (7 jours), activation PIN personnel (6 chiffres), blocage de connexion après tentatives échouées, réinitialisation PIN invalidant **toutes** les anciennes sessions salarié.
- Contrôle et validation de chaque journée, correction motivée y compris **clôture d'une sortie oubliée**, audit des modifications.
- Journées, semaines, mois cumulés; CSV à décimales françaises **des seules journées validées**, par client (Fontanel inclus comme filtre). Format comptable générique non officiel à confirmer avec le comptable.
- Absences soumises puis validées/refusées.

### Salarié
- Interface mobile compatible avec l’ajout à l’écran d’accueil (manifest; selon le navigateur). Aucune opération de pointage hors ligne n’est simulée.
- Page mobile avec chantier / horaires, bouton vert **COMMENCER**, bouton orange **PAUSE**, bouton vert **REPRENDRE**, bouton rouge **TERMINER** (confirmation finale).
- Le statut de la journée détermine quelles actions sont proposées. En cas de plusieurs chantiers le même jour, le prochain créneau non pointé reste disponible.
- Compteurs de temps réel de la journée, semaine et mois. Historiques et planning personnel uniquement.
- Les heures sont données par l'horloge **du serveur**. Un clic ambigu avec réseau instable peut être rejoué avec le même identifiant sans dupliquer l'événement.

## Architecture et modèle de fiabilité

- **Next.js 16 + TypeScript** (interface, API métier) sur **Netlify Free** via l’adaptateur OpenNext automatique fourni par Netlify. Ne pas épingler `@netlify/plugin-nextjs` sauf besoin explicite de revenir à l’ancien mode plugin.
- **Neon Free PostgreSQL** en région européenne, URL de connexion *pooled* pour les fonctions Netlify. Les identifiants vivent exclusivement dans les variables serveur.
- **Concurrence:** transaction pour chaque pointage, verrou d'enregistrement salarié `FOR UPDATE`, deux index uniques SQL (une session ouverte par salarié; une session par affectation), clés de requête idempotentes.
- **Durabilité:** `work_sessions`, `work_breaks`, `punch_events`, `request_receipts`, `audit_log`; jamais d'enregistrement RH dans localStorage. Les données de démo sont temporaires dans l'onglet.
- **Sessions:** cookies HTTP-only signés, rôle vérifié à chaque opération, incrément de version lors des réinitialisations PIN et désactivations.
- **Diagnostic:** endpoint `/api/health`; reports générés au serveur sans mise en cache.

## Mise en place Netlify + Neon (sans déposer de secret dans Git)

1. Créer un compte **Neon** et un projet PostgreSQL en région européenne (par ex. Francfort). Copier **localement**, de manière privée, l'URL **pooled** fournie par Neon.
2. Créer un dépôt GitHub **privé** avec uniquement les fichiers du dossier, en excluant `.env*` via `.gitignore`.
3. Dans **Netlify**, importer le dépôt GitHub. Framework **Next.js** détecté automatiquement, commande `npm run build`. L’adaptateur OpenNext est configuré automatiquement par Netlify. `netlify.toml` sélectionne Node 22.
4. Configurer dans **Site configuration → Environment variables** (scopes **Functions** et **Builds**) : `DATABASE_URL`, `APP_SESSION_SECRET`, `APP_SETUP_KEY` (temporaire). Les valeurs des deux secrets peuvent être générées séparément via `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Ne jamais utiliser `NEXT_PUBLIC_` pour ces variables.
5. Exécuter **une seule fois** la migration SQL dans **Neon SQL Editor** en collant le contenu de `db/schema.sql` **ou** en local via `node --env-file=.env.local scripts/migrate.mjs` (contre la bonne base). Le script SQL fonctionne sur base neuve ou déjà équipée de la V0.2 et ajoute la colonne `session_version`.
6. Déployer sur Netlify. Contrôler `/api/health` (`status=ok`), puis ouvrir l'application; créer le compte direction avec `APP_SETUP_KEY` et mot de passe d'au moins 12 caractères. Retirer `APP_SETUP_KEY` des paramètres Netlify après l'activation, puis **redéployer**.
7. Créer des salariés **fictifs** et deux chantiers fictifs. Valider tous les cas d'acceptation listés dans `RECETTE.md`, en particulier deux salariés pointant simultanément et toutes les erreurs réseau.
8. **Avant usage professionnel :** sauvegardes indépendantes et restauration testée, notices RGPD fournies, politique de conservation, comptes salariés individuels, procédure de secours papier, validation comptable du format Fontanel.

### Installation locale

```bash
npm install
cp .env.example .env.local
# remplir .env.local avec des identifiants de base de TEST
node --env-file=.env.local scripts/migrate.mjs
npm run dev
# autre terminal, sans secrets :
npm run test:logic
npm run typecheck
npm run build
```

## Disponibilité et coût

- **0 € mensuel** tant que les quotas gratuits des deux plateformes ne sont pas atteints; aucun SLA de production sur ces offres. La base Neon Free peut s'endormir après inactivité; les limites de crédit Netlify peuvent suspendre le site.
- Pour 10 salariés × 4 événements × 22 jours = **880 événements mensuels** en théorie, **plus** connexions, lectures et rapports. Une charge faible ne prouve ni une disponibilité continue ni l'absence de problème de réseau.
- Netlify : consulter les crédits consommés; Neon : surveiller CU-heures, stockage et transferts.
- En cas de panne, **ne pas inventer un pointage côté téléphone**; utiliser `CONTINUITE.md`, ressaisir par la direction avec motif, puis valider.
- Avoir un **processus de sauvegarde chiffrée indépendant** (ex. `pg_dump` vers un stockage chiffré géré par l'entreprise) et tester une restauration sur une base jetable. Les 6 heures de restauration instantanée de Neon Free **ne remplacent pas** une sauvegarde indépendante.

## Limites légales et comptables

- La pause prévisionnelle du chantier n'est **pas** automatiquement déduite du pointage. Seules les pauses pointées ou **corrigées et motivées** diminuent les heures nettes.
- Ce logiciel ne calcule **pas** les salaires, majorations, heures supplémentaires conventionnelles, paniers, trajets, congés payés ou indemnités selon la convention collective du BTP. Le comptable contrôle le relevé avant paie.
- **Fontanel** est ici un nom de client permettant de filtrer les rapports, **pas** une certification ni un export officiel Fontanel.
- Données RH : information des salariés, durée de conservation, sécurité et droit d'accès à définir avec l'entreprise au regard du RGPD. Aucun suivi GPS dans la V1.

## Fichiers clés

- `app/page.tsx`, `app/globals.css` : interfaces direction et salarié
- `app/api/route.ts` : API métier, sessions, pointages, validations
- `app/api/report/route.ts` : CSV sécurisé, semaine/mois
- `lib/time.ts`, `lib/period.ts`, `lib/csv.ts` : calculs testés
- `lib/security.ts`, `lib/auth-rules.ts` : sécurité de session
- `db/schema.sql` : schéma PostgreSQL et index de cohérence
- `RECETTE.md` : scénarios de recette avant mise en service
- `CONTINUITE.md` : fiche de pointage de secours

## Références de déploiement

- Netlify Next.js : https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/
- Neon Free : https://neon.com/pricing
- Netlify Free : https://www.netlify.com/pricing/
