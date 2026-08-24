# 🦦 AUDIT — Ma Petite Loutre

> **Document vivant.** Audit initial : 20/08/2026 (commit `a341189`, v4.10.0).
> Dernière mise à jour : 24/08/2026 (v4.10.25 — HOTFIX boot : sauvegarde existante plantait depuis T13).
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
| M5 | **God files** : `main.js` 3 392 lignes / 142 fonctions / 46 imports ; `render.js` `makeRenderer` 2 216 lignes | `src/main.js`, `src/render.js` | 🔄 **Chantier lancé** — **tranche 1 ✅ v4.10.7** (« La Crue » → `crue-controller.js`) · **tranche 2 ✅ v4.10.9** (« Dojo de parade » → `dojo-controller.js`) · **tranche 3 ✅ v4.10.10** (« Carte photo / partage » → `share-controller.js`) · **tranche 4 ✅ v4.10.11** (« Série de jours » → `streak-controller.js`) · **tranche 5 ✅ v4.10.12** (« Rituel du héron » → `heron-controller.js`) · **tranche 6 ✅ v4.10.13** (« Trésors / drops » → `treasure-controller.js`) · **tranche 7 ✅ v4.10.14** (« Écran des slots » → `slots-controller.js` ; cœur de persistance conservé dans main.js) · **tranche 8 ✅ v4.10.15** (« Troc / Atelier / Marché » → `marche-controller.js`) · **tranche 9 ✅ v4.10.16** (« Le Monde » → `world-controller.js` : balade/rencontres/épreuves/chasseur/coffres/trouvailles, −773 lignes, main.js **2 267 lignes**, contexte ~25 hooks, couture Combat par ponts, 521 tests verts dont smoke navigation + 19 snapshots) · **tranche 10 ✅ v4.10.17** (« Combat » → `combat-controller.js` : arène/adversaire sauvage/préparation/techniques ; l'état runtime `battle` vit dans le contrôleur, lu par la boucle via `getBattle()` et avancé par `stepCombat()` ; `setupCombat` injecte niveau/XP/quêtes/persist + ponts du Monde `resetBattleDone`/`clearEpreuve`/`onDuelOver` ; le lanceur `startBattle` remplace `battleStarter` pour la Crue et le Monde ; −43 lignes, main.js **2 224 lignes**, 521 tests verts dont smoke combat + snapshot arène) · **tranche 11 ✅ v4.10.18** (« Soins » → `soins-controller.js` : friandise/repas/bain/dodo/soin+trousse/plongée ; `setupSoins` injecte les helpers partagés press/feel/gainXp/afterAct/quest/varietyBonus/careBond/busy/unlocked/persist/checkUnlocks/tryDrop + R ; `resolveDive` exporté pour `tick()` ; boutons câblés inchangés ; −161 lignes, main.js **2 063 lignes**, 521 tests verts) · **tranche 12 ✅ v4.10.20** (« Mini-jeux » pêche/toboggan/jardin → `jeux-controller.js` : lancement `actPlay`/`actSlide`/`actGarden` + clôture `endGame`/`endSlide`/`endGarden` + `onFetchDone` ; l'état `mg` reste dans main.js — poussé via hook `setMinigame`, lu via `getMinigame` ; le routeur `onCanvasPointer` et les `tick*` restent orchestrateurs ; −155 lignes, main.js **1 944 lignes**, 522 tests verts) · **tranche 13 ✅ v4.10.21** (« Coach/onboarding » → `coach-controller.js` : tutoriel guidé `updateCoach`, cartes histoire/saison `maybeStory`/`maybeSeasonCard`, rappel saisonnier `seasonHint`, astuces de gestes `maybeHint`/`hintDone` ; l'état d'accompagnement — storyOpen/coachTarget/activeHint… — vit dans le contrôleur ; le rendu lit `currentHintTarget()`, `messageImportant` appelle `suppressHint()` ; −112 lignes, main.js **1 832 lignes**, 522 tests verts) · **tranche 14 ✅ v4.10.22** (« Réglages » → `reglages-controller.js` : son/musique/volume/a11y/push/télémétrie/dialogues/cycle de vie + export-import de save + reset ; `wireReglages()` câble le panneau, `openSettings` exporté ; le point délicat — l'IMPORT qui rerelie s/rec — reste dans main.js via `importSaveFromCode` + hook `importSave` ; −101 lignes, main.js **1 731 lignes**, 522 tests verts dont import round-trip + reset ; push non testable en jsdom) · **tranche 15 ✅ v4.10.23** (« Profil » garde-robe + gang → `profil-controller.js` : équiper/acheter chapeaux/pelages/décors/trésors, créer/recruter/batailler le gang ; `wireProfil()` câble slots+pt-gang, `openWardrobe`/`openGang` exportés — repointés par le hub Marché ; le reset des repères `prevHats`/`prevFurs` reste dans main via hook `syncUnlockBaselines` ; −140 lignes, main.js **1 591 lignes**, 522 tests verts) · **tranche 16 ✅ v4.10.24** (« Collections » Almanach/Succès/Carnet → `collections-controller.js` : piste de paliers de saison à réclamer, consultation des succès, carnet bestiaire/trouvailles/records à onglets ; `wireCollections()` câble b-gift/b-ach/ps-ach/pt-carnet/onglets/btn-ach-close ; `setupCollections` injecte persistRec/refreshGift/openSouvenir ; −49 lignes, main.js **1 542 lignes**, 522 tests verts) ; reste : Lieux, effondrement de boot() |
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
| | `197b2ce` | Bump v4.10.10 |
| **v4.10.11** | `55a0ad8` | **Découpage de main.js — tranche 4** : « Série de jours » (streak 🔥) extraite dans `src/streak-controller.js` (`setupStreak` injecte records/persist/gainXp/checkUnlocks ; pont `checkStreak`) ; ajouté au PRECACHE ; 521 tests verts |
| | `0540aa6` | Bump v4.10.11 |
| **v4.10.12** | `289a1ae` | **Découpage de main.js — tranche 5** : « Rituel du héron » (`actCare`, retour en 3 poissons espacés) extrait dans `src/heron-controller.js` (`setupHeron` injecte état/effets/press/careBond/gainXp/persist) ; imports `AWAY_CARE_*` retirés de main.js ; ajouté au PRECACHE ; 521 tests verts (dont smoke du rituel) |
| | `c08991d` | Bump v4.10.12 |
| **v4.10.13** | `831914c` | **Découpage de main.js — tranche 6** : « Trésors » (`tryDrop`, drops dans les activités + doublons → atelier) extrait dans `src/treasure-controller.js` (`setupTreasure` injecte état/records/persist/gainXp/burst) ; import `rollDrop` retiré de main.js ; ajouté au PRECACHE ; 521 tests verts |
| | `abf7afa` | Bump v4.10.13 |
| **v4.10.14** | `ba393f8` | **Découpage de main.js — tranche 7** : « Écran des slots » (lister/basculer/effacer) extrait dans `src/slots-controller.js` (`setupSlots` injecte getState/getActiveSlot/loadSlot/switchTo/deleteSlot) ; le cœur de persistance (makeSlotStorage/activeSlot/storage/switching/commitSlot) reste dans main.js (infra de boot) ; ajouté au PRECACHE ; 521 tests verts |
| | `00bcbc2` | Bump v4.10.14 |
| **v4.10.15** | `c18ac2e` | **Découpage de main.js — tranche 8** : « Troc + Atelier + Marché-HUB » extraits dans `src/marche-controller.js` (`setupMarche` injecte état/records/minigame/persist + openWardrobe/openGang ; ponts `openBarter`/`openWorkshop`/`openMarche`/`closeWorkshop` ; `workshopChoice` dans le contrôleur) ; imports economy (dailyBarter/canCraft/craftChoices/nextTier/TIERS/CRAFT_NEED) + ITEMS retirés de main.js (3 147 → **3 040**) ; ajouté au PRECACHE ; 521 tests verts |
| | `ee0860c` | Bump v4.10.15 |
| **v4.10.16** | `96cdd4d` | **Découpage de main.js — tranche 9 (la plus grosse)** : « Le Monde » extrait dans `src/world-controller.js` (état runtime `world`/`encounterOtter` + balade/mouvement/rencontres/recrutement/épreuves/chasseur/coffres/trouvailles/PNJ). −773 lignes (3 040 → **2 267**). `setupWorld` injecte ~25 accès ; la boucle lit `getWorld()` et appelle `stepWorld()`/`worldPointer()` ; couture Combat par ponts (`onDuelOverBridge`/`resetBattleDone`/`clearEpreuve`, `launchBattle`). Déplacement verbatim (sync() aux entrées). Ajouté au PRECACHE. 521 tests verts dont smoke navigation + 19 snapshots. **⚠️ pans non couverts par les tests à revérifier à la main : chasseur (capture), rencontres/befriend, épreuves/duel, brume/passage, PNJ (services).** |
| | — | Bump v4.10.16 |
| **v4.10.17** | `—` | **Découpage de main.js — tranche 10** : « Combat » (moteur de duel) extrait dans `src/combat-controller.js` (arène, tirage de l'adversaire sauvage, préparation, sélection des techniques). L'état runtime `battle` (non persisté) vit dans le contrôleur, lu à chaque image par la boucle via `getBattle()` et avancé par `stepCombat()` ; fermeture par `closeBattle()`, garde d'overlay par `battleActive()`. `setupCombat` injecte niveau/unlock/busy/XP/quêtes/varietyBonus/feel/persist + les ponts du Monde `resetBattleDone`/`clearEpreuve`/`onDuelOver` ; `wireCombat()` câble les boutons de l'arène. Le lanceur exporté `startBattle` remplace l'ancien `battleStarter` (Crue + Monde le reçoivent via le hook `launchBattle`). Imports `battle.js`/`combatBuffs` retirés de main.js. −43 lignes (2 267 → **2 224**). Ajouté au PRECACHE. 521 tests verts dont smoke « le début de combat secoue l'écran » + snapshot « combat (adversaire) » inchangé. |
| | — | Bump v4.10.17 |
| **v4.10.18** | `—` | **Découpage de main.js — tranche 11** : « Soins » (gestes de base) extraits dans `src/soins-controller.js` (`actTreat`/`actFeed`/`actWash`/`actSleep`/`actHeal`+`offrirTrousse`/`actDive`/`resolveDive`, interne `servirFriandise`). `setupSoins` injecte les helpers partagés (`press`/`feel`/`gainXp`/`afterAct`/`quest`/`varietyBonus`/`careBond`/`busy`/`unlocked`/`persist`/`persistRec`/`checkUnlocks`/`tryDrop`) + le renderer `R` ; `resolveDive` exporté pour `tick()`. `careBond`/`afterAct` (partagés pêche/pet/héron) restent dans main.js. Boutons `b-feed`/`b-wash`/… et hook debug inchangés (identifiants importés). −161 lignes (2 224 → **2 063**). Ajouté au PRECACHE. 521 tests verts. |
| | — | Bump v4.10.18 |
| **v4.10.19** | `—` | **Correctif — régression tranche 9** : l'auto-lancement du mini-jeu **jardin** en zone « jardin » du Monde était cassé depuis l'extraction T9. `goToZone` faisait `mg = newGarden(...)` sur le `mg` LOCAL du contrôleur (copie synchronisée depuis main), jamais celui de main.js où vit vraiment le mini-jeu — la boucle n'animait donc rien et le jardin était injouable en balade. Fix : nouveau hook `setMinigame` (world → main) appelé après le `newGarden`. **+1 test smoke** (« jardin en balade », 522 tests) qui verrouille le lancement — pan auparavant non couvert, signalé dans la note ⚠️ de T9. |
| | — | Bump v4.10.19 |
| **v4.10.20** | `—` | **Découpage de main.js — tranche 12** : « Mini-jeux » (pêche/toboggan/jardin) extraits dans `src/jeux-controller.js` : lancement (`actPlay`/`actSlide`/`actGarden`), clôture (`endGame`/`endSlide`/`endGarden`) et retour de balle (`onFetchDone`). L'état runtime `mg` **reste dans main.js** (lu chaque image par la boucle/le rendu/`busy()`/le routeur de pointeur) : le contrôleur le pousse via le hook `setMinigame` et le lit via `getMinigame`. Le routeur `onCanvasPointer` et les `tickGame`/`tickSlide`/`tickGarden` restent côté orchestrateur. `setupJeux` injecte les helpers partagés (press/feel/gainXp/afterAct/quest/varietyBonus/careBond/busy/unlocked/persist/checkUnlocks/tryDrop/messageImportant) + R. −155 lignes (2 063 → **1 944**). Ajouté au PRECACHE. 522 tests verts. |
| | — | Bump v4.10.20 |
| **v4.10.21** | `—` | **Découpage de main.js — tranche 13** : « Coach / Onboarding » extrait dans `src/coach-controller.js` : tutoriel de base guidé (`updateCoach`), cartes d'histoire et de saison (`maybeStory`/`maybeSeasonCard`), rappel saisonnier (`seasonHint`) et astuces de gestes découvrables (`maybeHint`/`hintDone`, table `HINTS`). L'état d'accompagnement (`storyOpen`/`coachTarget`/`activeHint`/`hintCooldown`/`lastSeasonHint`) vit dans le contrôleur. Le rendu lit `currentHintTarget()` ; `messageImportant` (resté dans main) appelle `suppressHint()`. `setupCoach` injecte état/renderer + `persist`/`diving`/`denAvailable` ; tables story/personality/seasons importées directement. −112 lignes (1 944 → **1 832**). Ajouté au PRECACHE. 522 tests verts. |
| | — | Bump v4.10.21 |
| **v4.10.22** | `—` | **Découpage de main.js — tranche 14** : « Réglages » extraits dans `src/reglages-controller.js` : son/musique/volume, accessibilité (gros texte, animations), rappels push, statistiques anonymes, dialogues vivants, cycle de vie complet, export/import de sauvegarde, passage de relais (reset). `wireReglages()` câble tout le panneau, `openSettings` (rafraîchissement des libellés) exporté. Le geste délicat — l'IMPORT d'une sauvegarde qui **rerelie s/rec** au jeu — reste dans main.js (`importSaveFromCode`, appelé via le hook `importSave`), là où vivent s/rec et les repères de déblocage. `setupReglages` injecte syncMusic/applyA11y/updateA11yLabels/updateVolumeLabel/persist/persistRec/startNew/clearSave. −101 lignes (1 832 → **1 731**). Ajouté au PRECACHE. 522 tests verts (dont import round-trip, reset, bascule musique) ; flux push non couvert par jsdom, déplacé verbatim. |
| | — | Bump v4.10.22 |
| **v4.10.23** | `—` | **Découpage de main.js — tranche 15** : « Profil » (garde-robe + gang) extrait dans `src/profil-controller.js`. Garde-robe : équiper chapeaux/pelages/décors/trésors + achats en gemmes (`buyCosmetic`, `onBuyTresor`) ; gang : créer/recruter/livrer une bataille de gang. `wireProfil()` câble les slots du profil (`ps-hat`/`ps-fur`/…) + `pt-gang` + `btn-hats-close` ; `openWardrobe`/`openGang` exportés et repointés par le hub Marché. Le réalignement des repères de déblocage (`prevHats`/`prevFurs`, après un achat payé) reste dans main.js via le hook `syncUnlockBaselines`. `__wardrobeHandlers` toujours exposé pour le banc jsdom. −140 lignes (1 731 → **1 591**). Ajouté au PRECACHE. 522 tests verts (achats boutique + recrutement/bataille de gang). |
| | — | Bump v4.10.23 |
| **v4.10.24** | `—` | **Découpage de main.js — tranche 16** : « Collections » (Almanach de saison + Succès + Carnet du naturaliste) extraites dans `src/collections-controller.js`. Almanach : piste de 8 paliers de saison, réclamation palier par palier (`claimTier`) ; Succès : consultation + extinction du badge de notif ; Carnet : bestiaire/trouvailles/records à onglets. `wireCollections()` câble `b-gift`/`b-ach`/`ps-ach`/`pt-carnet`/onglets/`btn-ach-close`. `setupCollections` injecte `persistRec`/`refreshGift`/`openSouvenir` ; tables almanach/seasons/quests importées directement. −49 lignes (1 591 → **1 542**). Ajouté au PRECACHE. 522 tests verts. |
| | — | Bump v4.10.24 |
| **v4.10.25** | `—` | **HOTFIX boot (régression tranche 13)** : toute sauvegarde d'un joueur **nommé** plantait le boot depuis l'extraction du Coach. Le bloc de restauration d'état (main.js) appelle `maybeStory`/`maybeSeasonCard`/`updateCoach` — désormais dans `coach-controller.js` — mais `setupCoach` était injecté APRÈS ce bloc : `ctx` null → `TypeError: getState`, boot interrompu, **aucun bouton câblé, app morte**. Les tests smoke ne démarrent qu'en PREMIÈRE visite (sans sauvegarde), d'où l'angle mort. Fix : `setupCoach` hissé AVANT la restauration d'état. **+1 test** `boot-resume.test.js` (jsdom, processus isolé, sauvegarde nommée pré-remplie → boot sans plantage) : échoue sur le code bugué, passe corrigé. **523 tests verts.** Vérifié navigateur (retour joueur → Chapitre 1 s'affiche, zéro erreur console). |
| | — | Bump v4.10.25 |

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
