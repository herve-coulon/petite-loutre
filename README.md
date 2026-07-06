# 🦦 Ma Petite Loutre

Un tamagotchi pixel art en **temps réel** : adopte un œuf, élève ta loutre, nourris-la, joue à la pêche avec elle, garde-la propre… Elle continue de vivre même quand l'app est fermée.

C'est une **PWA** (Progressive Web App) : elle s'installe sur iPhone et Android comme une vraie app (icône sur l'écran d'accueil, plein écran, hors-ligne), sans passer par les stores. Le passage en app native pour les stores est documenté plus bas (Capacitor).

## Jouer en local

Un serveur statique suffit (les modules ES exigent http://, pas file://) :

```bash
cd petite-loutre-app
python3 -m http.server 8080
# puis ouvrir http://localhost:8080
```

## Publier sur GitHub (2 commandes)

Le dépôt git est déjà initialisé avec son historique. Depuis le dossier du projet :

```bash
# Option A — avec GitHub CLI (gh) installé et connecté :
gh repo create petite-loutre --public --source=. --push

# Option B — à la main : créer un dépôt vide "petite-loutre" sur github.com, puis :
git remote add origin https://github.com/TON_PSEUDO/petite-loutre.git
git push -u origin main
```

Ensuite, **une seule fois** : sur GitHub → *Settings* → *Pages* → *Source* : **GitHub Actions**.

À chaque `git push`, le workflow lance les tests puis déploie automatiquement. Le jeu sera en ligne sur :
`https://TON_PSEUDO.github.io/petite-loutre/`

## Installer sur ton téléphone

Ouvre l'URL GitHub Pages sur le téléphone, puis :

- **Android (Chrome)** : bouton « 📲 Installer » dans le jeu, ou menu ⋮ → *Installer l'application*.
- **iPhone (Safari)** : bouton Partager ⎋ → *Sur l'écran d'accueil*.

L'app se lance alors en plein écran, fonctionne hors-ligne, et la loutre vit sa vie entre deux sessions (rattrapage plafonné à 7 jours). La sauvegarde est locale au téléphone.

## Gameplay

| Élément | Détail |
|---|---|
| Éclosion | 2 min après adoption (accélérable en réchauffant l'œuf) |
| Croissance | Bébé → jeune loutre à J+1 → adulte à J+3 |
| Jauges | Faim, humeur, énergie, propreté + santé |
| Actions | Manger 🐟, pêche 🎣 (mini-jeu), bain 🧼, dodo 💤, soin 💊, caresses (toucher la loutre) |
| Risques | Cacas à nettoyer, maladie, départ si la santé tombe à 0 |
| Ambiance | Ciel jour/crépuscule/nuit selon l'heure réelle, sons 8-bit, vibrations |

Équilibrage : toutes les constantes sont dans `src/constants.js`.

## Développement

```
index.html            page unique (aucun bundler, modules ES natifs)
manifest.webmanifest  manifeste PWA
sw.js                 service worker (hors-ligne) — ⚠️ incrémenter VERSION à chaque release
src/
  constants.js        équilibrage du jeu
  state.js            état + sauvegarde (stockage injecté)
  sim.js              moteur PUR (horloge et hasard injectés, événements)
  sprites.js          pixel art (grilles de caractères)
  minigame.js         pêche (logique pure)
  render.js           rendu canvas 160×120
  audio.js            bips 8-bit WebAudio + vibrations
  ui.js               DOM : HUD, jauges, overlays
  pwa.js              service worker, bouton installer, persistance
  main.js             orchestrateur
test/
  sim.test.js         23 tests du moteur (node --test, zéro dépendance)
  smoke.test.js       9 tests du parcours joueur complet (jsdom)
scripts/gen-icons.py  régénère les icônes depuis le sprite
```

```bash
npm install   # uniquement jsdom (pour les tests DOM)
npm test      # moteur + smoke
npm run icons # régénérer les icônes
```

La logique de jeu est **pure** (pas de DOM, horloge/hasard injectés) : c'est elle qui tourne à l'identique en direct et en rattrapage hors-ligne, et c'est pour ça qu'elle est testable à la milliseconde près.

## Passer en app native (App Store / Play Store)

La PWA couvre déjà l'installation mobile. Si tu veux les stores, [Capacitor](https://capacitorjs.com) embarque ce projet tel quel dans une app native :

```bash
npm install @capacitor/core @capacitor/cli
npx cap init "Ma Petite Loutre" "fr.astras.loutre" --web-dir .
npm install @capacitor/android && npx cap add android   # nécessite Android Studio
npm install @capacitor/ios && npx cap add ios           # nécessite Xcode (macOS)
npx cap open android   # puis build/signature dans Android Studio
```

Les dossiers `android/` et `ios/` générés sont déjà dans le `.gitignore`. Prévoir : compte Google Play (25 $ une fois) et/ou Apple Developer (99 $/an).

## Feuille de route (idées)

- Notifications locales « ta loutre a faim » (simple via Capacitor, sinon Web Push + serveur)
- Export/import de la sauvegarde (changement de téléphone)
- Accessoires à débloquer (chapeaux !), succès, records
- Deuxième mini-jeu (toboggan de rivière)
- i18n (en/es)
