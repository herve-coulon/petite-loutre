# 🦦 AUDIT — Ma Petite Loutre

> **Document vivant.** Audit initial : 20/08/2026 (commit `a341189`, v4.10.0).
> Dernière mise à jour : 20/08/2026 (v4.10.10, tranche 3 M5 — Carte photo / partage extraits).
> Dépôt : `herve-coulon/petite-loutre` — PWA tamagotchi pixel art, JS vanilla (zéro dépendance runtime), déployée sur GitHub Pages.

---

## 1. Synthèse exécutive

Très bonne santé générale pour un projet solo : moteur de jeu **pur et testé**, persistance migrée proprement, PWA solide, **aucun secret commité**, **aucune vulnérabilité critique**. La dette principale à l'audit : la croissance de deux fichiers monolithes (`main.js`, `render.js`) et deux bugs fonctionnels réels (télémétrie morte, backend push non versionné).

Depuis l'audit, **8 correctifs/améliorations ont été livrés** (v4.10.1 → v4.10.3) : la télémétrie fonctionne enfin, le raccourci PWA « Nourrir » est actif, la sauvegarde est honnête, la grille de combat est optimisée, les helpers sont dédupliqués, la CI est à jour et la couverture mesure désormais la couche DOM.

---

## 2. Chiffres clés

| Métrique | À l'audit | Aujourd'hui |
|---|---|---|
| Version | 4.10.0 | **4.10.3** |
| Lignes de source | 14 055 (51 modules) | ~14 100 (52 modules, +`util.js`) |
| Tests | suite verte | **512 verts** (427 sim + 66 smoke DOM + 19 visuels) dont **5 nouveaux** |
| Couverture lignes | 78,9 % (sans le DOM) | 78,7 % (**avec** le DOM : main.js 71 %, ui.js 76 %) |
| Dépendances runtime | 0 | 0 |
| `npm audit` | 0 vuln | 0 vuln |
| PRECACHE service worker | 88 URLs | 88 URLs (toutes vérifiées en CI) |

---

## 3. Points forts (confirmés)

1. **Moteur pur exemplaire** — `sim.js`, `state.js`, `economy.js`, `minigame.js`, `toboggan.js` : horloge et hasard injectés, zéro DOM, testés individuellement.
2. **Persistance robuste et migrée** — storage injecté, slots remappés, `normalizeState`/`normalizeRecords` documentés, try/catch partout.
3. **PWA irréprochable** — cache versionné, anti-mixage de versions documenté (`sw.js:143-146`), chemins 100 % relatifs, garde-fou CI PRECACHE ↔ `_site`, versioning triple synchronisé (`package.json` / `GAME_VERSION` / `VERSION`).
4. **Sécurité de bon niveau** — 0 secret dans l'historique, XSS neutralisé (échappement systématique, nom limité à 12 chars), CSP `script-src 'self'`, SW même-origine.
5. **Accessibilité réfléchie** — aria, gros texte, `prefers-reduced-motion`.
6. **Tests sérieux** — aucun test vide/skip, snapshots pixel par pixel, smoke jsdom qui boote réellement l'app.
7. **Vie privée bien pensée** — payload télémétrie minimal, opt-out, fire-and-forget non bloquant.

---

## 4. Problèmes identifiés et statut

### 🟠 Majeurs

| # | Problème | Localisation | Statut |
|---|---|---|---|
| M1 | **Télémétrie morte** : ID jamais généré (code mort — génération dans le bloc gardé par `canSendTelemetry` qui l'exige) | `telemetry.js:46`, `main.js:2603` | ✅ **Corrigé v4.10.1** (ID généré hors du garde) + test d'intégration |
| M2 | **Fonction Supabase `push` non versionnée** dans le dépôt (seul `telemetry` existait) — non reproductible, non auditable | `src/push.js:6`, `supabase/functions/` | ✅ **Corrigé** (fonction déployée téléchargée et versionnée dans `supabase/functions/push/` + migration des tables + `config.toml` + doc README) |
| M3 | **Endpoint télémétrie public** sans rate limiting ni validation (id/day seulement truthy, types non vérifiés) | `supabase/functions/telemetry/index.ts` | ✅ **Corrigé et DÉPLOYÉ** (validation stricte : id 16 hex, jour valide borné, entiers bornés, corps ≤ 4 Ko ; gardes de volume jour/id ; erreurs génériques ; CORS restreint) — **vérifié en production** (200 valide / 400 invalide / 413 gros corps / CORS bloqué) |
| M4 | **Politique RLS d'insertion ouverte à anon** (`with check (true)`) — insertion REST directe sans passer par la fonction | `telemetry_daily.sql:20-22` | ✅ **Corrigé, DÉPLOYÉ et VÉRIFIÉ** — politique supprimée + `revoke insert, update, delete` (anon/authenticated) sur `telemetry_daily`/`push_subs`/`push_config` ; test en prod : REST direct anon → `42501 permission denied` (401), fonction service_role → 200 |
| M5 | **God files** : `main.js` 3 392 lignes / 142 fonctions / 46 imports ; `render.js` `makeRenderer` 2 216 lignes | `src/main.js`, `src/render.js` | 🔄 **Chantier lancé** — **tranche 1 ✅ v4.10.7** (« La Crue » → `crue-controller.js`) · **tranche 2 ✅ v4.10.9** (« Dojo de parade » → `dojo-controller.js`) · **tranche 3 ✅ v4.10.10** (« Carte photo / partage du jour » → `share-controller.js`, `cardCv` dans le contrôleur, 61 lignes retirées, main.js **3 204 lignes**, 521 tests verts dont snapshots) ; reste : Streak, Héron, Trésors, Slots, Marché, Monde, Combat, Boot |
| M6 | **Échecs de sauvegarde silencieux** — `persist()` ignorait le retour de `saveState` (QuotaExceeded, mode privé…) | `state.js:112-119`, `main.js` | ✅ **Corrigé v4.10.1** (toast « stockage plein/bloqué », throttle 60 s) |
| M7 | **Import de sauvegarde à validation superficielle** — jauges/nom non bornés, taille non limitée | `state.js:266-276` | ✅ **Corrigé v4.10.4** — bornes de taille (100 Ko), clamps des jauges (0-100, défauts sains), whitelist de stade, nom borné, NaN/Infinity (`1e999`) neutralisés, tableaux/chaînes tronqués — appliqué à l'import ET au chargement (`loadState`/`loadRecords`) + 7 tests |
| M8 | **Raccourci manifest « Nourrir » mort** — `?action=feed` jamais lu | `manifest.webmanifest:15-21` | ✅ **Corrigé v4.10.1** (consommé au boot, URL nettoyée, testé) |
| M9 | **Code mort** : exports jamais utilisés (`sfxBus`, `MEAL_FISH_COST`, `isGardenPlaying`…), 6 imports inutiles | divers | ✅ **Corrigé v4.10.1** (+ patch de design obsolète supprimé) |
| M10 | **Duplications** : `esc` ×2, `clamp`/`clamp01` ×4, formateurs de durée ×3, seuils de jauge codés en dur à 3 endroits | `main.js`, `ui.js`, `audio.js`, `minigame.js`, `toboggan.js`, `photocard.js` | ✅ **Corrigé v4.10.3** (module `util.js` ; reste : seuils de jauge, voir §6) |

### 🟡 Mineurs

| # | Problème | Statut |
|---|---|---|
| m1 | Rebuild DOM de la grille de combat **à chaque frame** (60 fps inutiles) | ✅ **Corrigé v4.10.2** (grille mémoïsée sur signature phase/combo/PP) |
| m2 | 115 `addEventListener`, 0 `removeEventListener` | ⏳ À faire (signal, sans conséquence SPA) |
| m3 | `window.__loutre` exposé en production (tests e2e) | ⏳ Assumé (documenté) |
| m4 | 383 magic numbers dans main.js ; seuils de jauge (20/15/25) désynchronisés ui/render/sim | ✅ **Seuils centralisés v4.10.6** (`GAUGE_LOW`, `GAUGE_HEALTH_LOW`, `SICK_HUNGER`, `SICK_CLEAN` dans constants.js — valeurs inchangées, une source) ; reste : autres magic numbers |
| m5 | Canvas sans garde-fou → écran blanc si non supporté ; aucune gestion d'erreur globale | ✅ **Corrigé v4.10.3** (erreur claire + handlers `error`/`unhandledrejection` avec sauvegarde) |
| m6 | CSP incomplète (`base-uri`/`object-src`/`form-action` absents ; `unsafe-inline` style pour 3 styles) | ⏳ À faire |
| m7 | Pas de headers de sécurité sur gh-pages (HSTS…) — limite plateforme | ⏳ À faire si migration CDN |
| m8 | Pas de retry télémétrie (ping perdu si hors-ligne) | ✅ **Corrigé v4.10.5** — le jour n'est marqué envoyé qu'au SUCCÈS ; échec → réessai throttlé 10 min (`s.nextTelemetryRetry`, persistant) ; `sendTelemetry` borné à 8 s (AbortController) ; tests unitaires + smoke |
| m9 | Mix français/anglais dans les identifiants | ⏳ À faire (convention) |
| m10 | `esc()` n'échappe pas l'apostrophe (non exploité) | ⏳ À faire |
| m11 | `manifest.id` en dur vers l'URL gh-pages ; « screenshot » = icône 512 (pas une vraie capture) | ⏳ À faire |
| m12 | Couverture non mesurée pour main.js/ui.js (smoke exclu du run) | ✅ **Corrigé v4.10.1** (smoke dans `npm run coverage`) |
| m13 | Migration vestigiale `telemetry_fix_id_type` ; commentaire `config.toml` mentionnant `kimi-client.js` disparu ; edge function `kimi-chat` dormante à distance | ⏳ Cosmétique — `config.toml` corrigé (v4.10.2) ; **`kimi-chat` vérifiée NON déployée** (fonctions list = push + telemetry seulement, 08/2026) + note README à jour |
| m14 | Avertissement CI « Node 20 déprécié » (checkout/configure-pages/deploy-pages/upload-pages-artifact) | ✅ **Corrigé v4.10.2** (actions passées aux majors récentes ; reste `setup-node@v4` + une dépendance transitive, bénins) |

---

## 5. Avancées réalisées (journal)

| Version | Commit | Contenu |
|---|---|---|
| **v4.10.1** | `3ecac09` | Quick wins lot 1 : télémétrie réparée, raccourci « Nourrir » actif, sauvegarde honnête, code mort retiré, smoke test dans la couverture, stub réseau de test |
| | `935fb05` | Bump v4.10.1 (triple synchro) — diffusion aux joueurs existants (nouveau SW) |
| **v4.10.2** | `b3fe628` | Perf : grille de combat mémoïsée (reconstruite seulement quand phase/combo/PP changent) |
| | `02dd103` | CI : actions GitHub à jour (Node 20 déprécié) — checkout@v5, configure-pages@v6, upload-pages-artifact@v4, deploy-pages@v5 |
| | `c81f6ab` | Bump v4.10.2 |
| **v4.10.3** | `8856fdc` | Refactor : module `util.js` (esc/clamp01/fmtDur — 6 implémentations dupliquées → 1 source), garde-fous globaux (`error`/`unhandledrejection` + sauvegarde + toast), garde-fou canvas, `clampN` → `clamp`, tests unitaires util |
| | `4d381b4` | Bump v4.10.3 |
| **infra** | `3721b85` | Docs : `AUDIT.md` créé (document vivant) |
| | `a6b5028` | **Backend push versionné** : fonction déployée téléchargée (`supabase/functions/push/index.ts`), migration `push_subs`/`push_config`, `[functions.push]` dans `config.toml`, procédure de déploiement + cron documentée dans le README |
| | `283e84a` | **Durcissement telemetry (M3+M4)** : validation stricte (id 16 hex, jour borné, entiers bornés, corps ≤ 4 Ko), gardes de volume jour/id (429), erreurs génériques, CORS restreint ; politique d'insertion anon supprimée + privilèges révoqués (anon/authenticated) |
| | — | **Déploiements prod** : `functions deploy telemetry` (M3) + application de la migration M4 (SQL Editor / db push) — **tous deux vérifiés en production** (200 valide / 400-413 abus / REST anon refusé 42501, clé anon du dépôt toujours valide) |
| **v4.10.4** | `8703235` | **`importSave` durci (M7)** : borne de taille (100 Ko), clamps des jauges, whitelist de stade, nom borné, NaN/Infinity (`1e999`) → défauts sains, chaînes/tableaux tronqués ; appliqué aussi à `loadState`/`loadRecords` + `test/state.test.js` (7 tests) |
| | `b84f6a5` | Bump v4.10.4 |
| **v4.10.5** | `f1089a4` | **Retry télémétrie (m8)** : jour marqué uniquement au succès, réessai throttlé 10 min, timeout fetch 8 s ; tests unitaires `sendTelemetry` + smoke mis à jour |
| | `3d5586a` | Bump v4.10.5 |
| **v4.10.6** | `021d41b` | **Seuils de jauge centralisés** (`GAUGE_LOW`/`GAUGE_HEALTH_LOW`/`SICK_HUNGER`/`SICK_CLEAN` — valeurs inchangées, une source ui/render/sim) + **kimi vérifié non déployé** (note README à jour) |
| | `fb7c1fd` | Bump v4.10.6 |
| **v4.10.7** | `c6029eb` | **Découpage de main.js — tranche 1** : « La Crue » extraite dans `src/crue-controller.js` (contexte injecté par `setupCrue`, ponts `crueDuelActive`/`resolveCrueDuel`/`crueBannerOnce`/`currentCrue`) ; 82 lignes retirées de main.js ; +1 test smoke (ouverture de l'overlay) |
| | `1434a13` | Bump v4.10.7 |
| **v4.10.8** | `e6b89ab` | **PRECACHE complet + garde-fou CI** : `crue-controller.js` et `util.js` manquaient dans le PRECACHE (import cassé en mise à jour hors-ligne) — ajoutés ; garde-fou CI « sens inverse » (tout module importé par index.html/`src/*.js` doit être précaché, sinon échec de déploiement) |
| | `74f3c41` | Bump v4.10.8 |
| **v4.10.9** | `03b3352` | **Découpage de main.js — tranche 2** : « Dojo de parade » extrait dans `src/dojo-controller.js` (`setupDojo` injecte état/records/gainXp/persist ; les timers `setTimeout` vivent dans le contrôleur ; ponts `openDojo`/`dojoTap`/`closeDojo`) ; 103 lignes retirées de main.js (3 368 → **3 265**) ; ajouté au PRECACHE ; 521 tests verts (snapshots inclus) |
| | `884bb02` | Bump v4.10.9 |
| **v4.10.10** | `3c4f39d` | **Découpage de main.js — tranche 3** : « Carte photo » + « Partage du jour » extraits dans `src/share-controller.js` (`setupShare` injecte état/records ; `cardCv` dans le contrôleur ; ponts `openPhoto`/`sharePhoto`/`savePhoto`/`closePhoto`/`shareDayResult`) ; 61 lignes retirées (3 265 → **3 204**) ; ajouté au PRECACHE ; 521 tests verts |
| | — | Bump v4.10.10 |

**Nouveaux tests ajoutés** (5) : raccourci PWA « Nourrir » (smoke), télémétrie — ID généré (smoke), `esc` / `clamp01` / `fmtDur` (`test/util.test.js`).

**Fichiers créés** : `src/util.js`, `test/util.test.js`, `AUDIT.md`, `src/crue-controller.js`, `src/dojo-controller.js`.

---

## 6. Dette restante — prochaines étapes recommandées

### 🔒 Backend Supabase (prioritaire)
1. ~~**Versionner `supabase/functions/push/index.ts`** + le cron (M2)~~ ✅ fait — restent : déployer la migration (`supabase db push`) et re-créer le cron 10 min dans le Dashboard si un projet était recréé de zéro (procédure dans le README).
2. ~~**Durcir l'edge function `telemetry`** (M3)~~ ✅ fait (validation stricte, gardes de volume, erreurs génériques, CORS restreint) — reste à **déployer** la nouvelle version (`supabase functions deploy telemetry`).
3. ~~**`revoke insert, update, delete … from anon`** sur `telemetry_daily` (M4)~~ ✅ fait ET déployé (migration `20260820100000_telemetry_harden.sql` + `push_subs`/`push_config`) — vérifié en prod : REST anon refusé.
4. ~~**Durcir `importSave`** (M7)~~ ✅ fait v4.10.4 (whitelist de champs, bornes, taille max + tests d'import malveillant).
5. ~~**Retry télémétrie** (m8)~~ ✅ fait v4.10.5 (jour marqué au succès, réessai throttlé 10 min, timeout 8 s).
6. ~~Nettoyage : undeploy `kimi-chat`~~ ✅ vérifié — kimi-chat n'est plus déployée (functions list : push + telemetry seulement) ; note README à jour. Reste cosmétique : migration vestigiale `telemetry_fix_id_type` (historique réécrit, sans conséquence), rotation d'ID à la réactivation de la télémétrie.

### 🏗️ Architecture (chantiers multi-releases)
7. **Découper `main.js`** par domaines (Monde, Combat, Marché, Slots, Boot → modules `*Controller`) — **tranche 1 faite** (La Crue, v4.10.7, méthode validée : une section par commit, contexte injecté, 521 tests + snapshots comme arbitres). Prochaines tranches recommandées : Dojo (autonome), Carte photo, Streak, puis Héron/Trésors, enfin Monde et Combat (les plus couplés).
8. **Découper `makeRenderer`** en sous-renderers par scène (berge, monde, tanière, mini-jeux, effets).

### ✨ Qualité de code
9. **Constantes partagées** pour les seuils de jauge (`GAUGE_LOW`, `CREATURE_DMG`, …) utilisées par ui.js / render.js / sim.js (m4).
10. **Migrer les 3 styles inline** vers des classes pour retirer `'unsafe-inline'` de la CSP (m6).
11. **Échapper l'apostrophe** dans `esc()` + test (m10).
12. **Nettoyage** : `manifest.id`/screenshots (m11), convention de nommage fr/en (m9).

---

## 7. Notes d'exploitation

- **Diffusion aux joueurs** : toute modification de `src/` exige un bump du `sw.js` (`VERSION`) — les navigateurs ne réinstallent le SW que si son fichier change. Le bump triple est automatisé (`npm run version:bump`) et vérifié (`npm run version:check`).
- **Déploiement** : un push sur `main` déclenche `Tests & Déploiement GitHub Pages` (tests obligatoires, vérification PRECACHE ↔ `_site`, puis deploy).
- **Vue mobile** : le jeu est conçu mobile-first/portrait (canvas 160×346, colonne 460 px, `orientation: portrait`) — sur laptop, il s'affiche en colonne téléphone centrée : comportement voulu, pas un bug.
