# 🦦 AUDIT — Ma Petite Loutre

> **Document vivant.** Audit initial : 20/08/2026 (commit `a341189`, v4.10.0).
> Dernière mise à jour : 20/08/2026 (commit `a6b5028`, v4.10.3).
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
| M3 | **Endpoint télémétrie public** sans rate limiting ni validation (id/day seulement truthy, types non vérifiés) | `supabase/functions/telemetry/index.ts` | ✅ **Corrigé** (validation stricte : id 16 hex, jour valide borné, entiers bornés, corps ≤ 4 Ko ; gardes de volume jour/id ; erreurs génériques ; CORS restreint par origine) |
| M4 | **Politique RLS d'insertion ouverte à anon** (`with check (true)`) — insertion REST directe sans passer par la fonction | `telemetry_daily.sql:20-22` | ✅ **Corrigé** (politique supprimée + `revoke insert, update, delete` sur `telemetry_daily`/`push_subs`/`push_config` pour anon/authenticated — fonction service_role seule) |
| M5 | **God files** : `main.js` 3 392 lignes / 142 fonctions / 46 imports ; `render.js` `makeRenderer` 2 216 lignes | `src/main.js`, `src/render.js` | ⏳ **À faire** (chantier multi-releases, voir §6) |
| M6 | **Échecs de sauvegarde silencieux** — `persist()` ignorait le retour de `saveState` (QuotaExceeded, mode privé…) | `state.js:112-119`, `main.js` | ✅ **Corrigé v4.10.1** (toast « stockage plein/bloqué », throttle 60 s) |
| M7 | **Import de sauvegarde à validation superficielle** — jauges/nom non bornés, taille non limitée | `state.js:266-276` | ⏳ **À faire** |
| M8 | **Raccourci manifest « Nourrir » mort** — `?action=feed` jamais lu | `manifest.webmanifest:15-21` | ✅ **Corrigé v4.10.1** (consommé au boot, URL nettoyée, testé) |
| M9 | **Code mort** : exports jamais utilisés (`sfxBus`, `MEAL_FISH_COST`, `isGardenPlaying`…), 6 imports inutiles | divers | ✅ **Corrigé v4.10.1** (+ patch de design obsolète supprimé) |
| M10 | **Duplications** : `esc` ×2, `clamp`/`clamp01` ×4, formateurs de durée ×3, seuils de jauge codés en dur à 3 endroits | `main.js`, `ui.js`, `audio.js`, `minigame.js`, `toboggan.js`, `photocard.js` | ✅ **Corrigé v4.10.3** (module `util.js` ; reste : seuils de jauge, voir §6) |

### 🟡 Mineurs

| # | Problème | Statut |
|---|---|---|
| m1 | Rebuild DOM de la grille de combat **à chaque frame** (60 fps inutiles) | ✅ **Corrigé v4.10.2** (grille mémoïsée sur signature phase/combo/PP) |
| m2 | 115 `addEventListener`, 0 `removeEventListener` | ⏳ À faire (signal, sans conséquence SPA) |
| m3 | `window.__loutre` exposé en production (tests e2e) | ⏳ Assumé (documenté) |
| m4 | 383 magic numbers dans main.js ; seuils de jauge (20/15/25) désynchronisés ui/render/sim | ⏳ À faire (constantes partagées) |
| m5 | Canvas sans garde-fou → écran blanc si non supporté ; aucune gestion d'erreur globale | ✅ **Corrigé v4.10.3** (erreur claire + handlers `error`/`unhandledrejection` avec sauvegarde) |
| m6 | CSP incomplète (`base-uri`/`object-src`/`form-action` absents ; `unsafe-inline` style pour 3 styles) | ⏳ À faire |
| m7 | Pas de headers de sécurité sur gh-pages (HSTS…) — limite plateforme | ⏳ À faire si migration CDN |
| m8 | Pas de retry télémétrie (ping perdu si hors-ligne) | ⏳ À faire |
| m9 | Mix français/anglais dans les identifiants | ⏳ À faire (convention) |
| m10 | `esc()` n'échappe pas l'apostrophe (non exploité) | ⏳ À faire |
| m11 | `manifest.id` en dur vers l'URL gh-pages ; « screenshot » = icône 512 (pas une vraie capture) | ⏳ À faire |
| m12 | Couverture non mesurée pour main.js/ui.js (smoke exclu du run) | ✅ **Corrigé v4.10.1** (smoke dans `npm run coverage`) |
| m13 | Migration vestigiale `telemetry_fix_id_type` ; commentaire `config.toml` mentionnant `kimi-client.js` disparu ; edge function `kimi-chat` dormante à distance | ⏳ À faire (cosmétique) |
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

**Nouveaux tests ajoutés** (5) : raccourci PWA « Nourrir » (smoke), télémétrie — ID généré (smoke), `esc` / `clamp01` / `fmtDur` (`test/util.test.js`).

**Fichiers créés** : `src/util.js`, `test/util.test.js`, `AUDIT.md`.

---

## 6. Dette restante — prochaines étapes recommandées

### 🔒 Backend Supabase (prioritaire)
1. ~~**Versionner `supabase/functions/push/index.ts`** + le cron (M2)~~ ✅ fait — restent : déployer la migration (`supabase db push`) et re-créer le cron 10 min dans le Dashboard si un projet était recréé de zéro (procédure dans le README).
2. ~~**Durcir l'edge function `telemetry`** (M3)~~ ✅ fait (validation stricte, gardes de volume, erreurs génériques, CORS restreint) — reste à **déployer** la nouvelle version (`supabase functions deploy telemetry`).
3. ~~**`revoke insert, update, delete … from anon`** sur `telemetry_daily` (M4)~~ ✅ fait (migration `20260820100000_telemetry_harden.sql` + `push_subs`/`push_config`) — reste à **déployer** la migration (`supabase db push`).
4. **Durcir `importSave`** (M7) : whitelist de champs, bornes, taille max + test d'import malveillant.
5. **Retry télémétrie** (m8) : file d'attente au prochain tick si le ping échoue.
6. Nettoyage : undeploy `kimi-chat` à distance, rotation d'ID à la réactivation de la télémétrie.

### 🏗️ Architecture (chantiers multi-releases)
7. **Découper `main.js`** par domaines (Monde, Combat, Marché, Slots, Boot → modules `*Controller`) — les 20 bannières de sections sont le plan ; chaque tranche validée par les tests + snapshots visuels.
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
