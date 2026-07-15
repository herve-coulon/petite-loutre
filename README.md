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
| Éclosion | 2 min après adoption — accélérable en réchauffant l'œuf, en le touchant… ou en secouant le téléphone pour le bercer 📳. L'œuf se **fissure progressivement** et tremble tout seul quand ça va craquer 🥚 |
| Aventure 📖 | La vie se raconte en **chapitres** : la naissance (Chapitre 1), puis un moment d'histoire à chaque grande étape (jeune, adulte). Les premières minutes sont **guidées** : le prochain geste à faire (manger, jouer, laver) est surligné et expliqué |
| Saisons 🍂 | La berge vit au rythme des **saisons réelles** (identiques pour tous) : printemps (vert vif, pétales 🌸), été (☀️), automne (berge dorée, feuilles 🍂), hiver (neige, rivière glacée ❄️). Une carte d'histoire annonce chaque changement de saison |
| Météo & santé 🌡️ | Les saisons **pèsent sur la santé** : l'**hiver**, le froid fait attraper froid (risque de maladie accru, pire si elle est affaiblie — elle grelotte) ; l'**été**, la chaleur donne soif et épuise, et elle surchauffe si on ne la rafraîchit pas (elle transpire). On contre avec les gestes habituels : **Laver** rafraîchit (gros boost l'été), **Manger/Dodo/câlins** réchauffent et réconfortent |
| Trésor de saison 🎁 | Chaque jour, un cadeau thématique à récolter sur la berge (touche-le) : 🌸 fleur au printemps, 🍉 pastèque l'été, 🌰 châtaigne l'automne, ⛄ bonhomme de neige l'hiver — chacun avec sa petite récompense. Un record compte les trésors récoltés |
| Croissance | Bébé → jeune loutre à J+1 → adulte à J+3 |
| Jauges | Faim, humeur, énergie, propreté + santé |
| Actions | Manger 🐟, pêche 🎣 (mini-jeu), bain 🧼, dodo 💤, soin 💊, caresses (toucher la loutre), friandise 🍡 (Niv 2), plongée au trésor 🤿 (Niv 6) |
| Déblocages 🔓 | Les activités s'ouvrent au fil des **niveaux du soigneur** : friandise (Niv 2), toboggan (Niv 3), plongée (Niv 6), combat (Niv 10). Un bouton verrouillé reste tapable et **dit à quel niveau il s'ouvre** ; chaque montée de niveau annonce sa nouveauté (réglable dans `UNLOCK_LEVEL`) |
| Mini-jeux 🎮 | **Pêche** 🎣 : touche les poissons. **Toboggan de rivière** 🛝 (Niv 3) : la loutre dévale les rapides sur 3 couloirs — tape le couloir voulu pour gober les 🐟 et esquiver les 🪨 (descente parfaite = 5 poissons sans un rocher) |
| Combats ⚔️ | Duels par code de défi à s'échanger entre amis (Niv 10) |
| Quêtes 🏆 | 3 micro-objectifs par jour, identiques pour tout le monde |
| Niveaux ⭐ | Chaque geste rapporte de l'XP (« +5 » à l'écran) : **50 niveaux** dont le coût se durcit (le 50 est un objectif long-terme), titres honorifiques jusqu'à « Gardien légendaire », friandise rechargée à chaque montée, cosmétiques de palier — le niveau survit aux loutres |
| Trésors 💎 | **26 objets rares équipables** à **4 raretés** (commun → légendaire), chacun avec un **petit bonus de jeu** (+XP, jauges plus lentes, résistance aux saisons, meilleure chance…). On les gagne de deux façons : **14 paliers de niveau** garantis (étalés du Niv 3 au 50) et **drops** aléatoires dans les activités (plongée, toboggan, combat, pêche, trésor de saison). Un seul équipé à la fois ; une lueur de sa rareté orbite près de la loutre |
| Objectifs du jour 🎯 | Un bandeau permanent en haut de l'écran montre les **3 quêtes du jour** avec leur progression et la **série 🔥** — d'un coup d'œil, sans ouvrir de menu (un tap ouvre le détail) |
| Menus | Garde-robe **en onglets** (💎 Trésors / 🎩 Chapeaux / 🦦 Pelages / 🌿 Décor), boutons du bas **libellés** (Son, Garde-robe, Succès, Photo, Réglages), réglages **rangés par section** (Son / Accessibilité / Rappels / Sauvegarde / Zone de danger) |
| Série 🔥 | Revenir chaque jour entretient la flamme : paliers 3/7/14/30 jours (XP, pelage Braise, succès) |
| Chez le héron 🪶 | Plus de mort : négligée, la loutre part bouder chez le héron — on la ramène par 3 soins espacés de 3 h, elle rentre boudeuse |
| Surprise du jour ✨ | Un événement quotidien identique pour tous (papillon rare à attraper +10 XP, pluie aux champignons, héron pêcheur, canetons, arc-en-ciel) |
| Partage du jour 📣 | Résultat quotidien façon Wordle (✅✅⬜ 2/3 · NIV · 🔥) à envoyer d'un tap |
| Rappels 🔔 | Opt-in dans ⚙️ : « elle a faim », « le héron t'attend », « quêtes fraîches » — notifications même app fermée (serveur Supabase gratuit, abonnements anonymes ; iPhone : app installée, iOS 16.4+) |
| Risques | Cacas à nettoyer, maladie, départ si la santé tombe à 0 |
| Ambiance 🎧 | Ciel jour/crépuscule/nuit selon l'heure réelle ; **lit sonore procédural** (eau qui clapote, oiseaux au printemps/été, grillons l'été la nuit, vent l'automne/hiver) ; **musique chiptune** enjouée le jour / berceuse la nuit, **teintée par la saison** (clochette d'hiver, timbres qui changent) ; **vrai bus de mixage** (les actions *duckent* la musique) + **réglage de volume** dans ⚙️ ; SFX 8-bit à micro-variation de hauteur (pas de fatigue de répétition), vibrations, libellule et poissons sauteurs, confettis et squash & stretch |
| Expressivité 🦦 | Le visage suit l'humeur (contente, affamée, boudeuse, malade) ; elle se gratte, bâille et jongle avec un caillou quand tout va bien — et boude 10 min si on la réveille trop tôt (un câlin ou une friandise la déride) |
| Caractère 💛 | Chaque loutre a une **personnalité** tirée au baptême (Gourmande, Joueuse, Dormeuse, Câline, Coquette, Aventurière) — donc son **activité préférée** : la lui offrir déclenche une réaction unique + un éclat de joie. Un **lien** grandit à chaque geste (double sur l'activité préférée) et franchit des paliers célébrés (Complices → Âmes sœurs) ; à haut lien, elle est plus démonstrative au retour. Personnalité + lien affichés dans le HUD et l'écran 🏆 |
| Carte photo 📸 | Carte souvenir générée (nom, chapeau, exploits du jour) à partager sur WhatsApp/Insta via le partage natif |
| Garde-robe 🎩 | 6 chapeaux, 6 pelages, 5 décors de berge à débloquer (records globaux, conservés entre les vies) |
| Succès 🏆 | succès + records (longévité, poissons, repas, meilleur toboggan…) |
| Accessibilité ♿ | **Mouvement réduit** (respecte `prefers-reduced-motion` du système, + interrupteur ⚙️) : coupe particules, secousses, clignotements et grosses rafales ; **gros texte** (interrupteur ⚙️) qui agrandit les textes les plus lus |
| Sauvegarde ⚙️ | Export/import par code pour changer de téléphone |

Équilibrage : toutes les constantes sont dans `src/constants.js`.

## Développement

```
index.html            page unique (aucun bundler, modules ES natifs)
manifest.webmanifest  manifeste PWA
sw.js                 service worker (hors-ligne) — ⚠️ incrémenter VERSION à chaque release
src/
  fonts.css           police pixel embarquée (Pixelify Sans, woff2 en data-URI)
  constants.js        équilibrage du jeu
  state.js            état + sauvegarde (stockage injecté)
  sim.js              moteur PUR (horloge et hasard injectés, événements)
  sprites.js          pixel art (grilles de caractères)
  accessories.js      chapeaux à débloquer (conditions sur records)
  achievements.js     succès globaux
  skins.js            pelages (palette swap) et décors de berge
  battle.js           combats par code de défi (pur, RNG seedé)
  quests.js           quêtes du jour (déterministes par date)
  level.js            XP, niveaux et titres du soigneur (pur)
  streak.js           série de jours et paliers (pur)
  share.js            résultat quotidien à partager (pur)
  events.js           surprise du jour, déterministe par date (pur)
  push.js             rappels push : calcul pur + abonnement navigateur
  mood.js             humeurs et manies de la loutre (pur)
  personality.js      caractère : personnalité tirée au baptême + lien (pur)
  story.js            fil narratif (chapitres) + premiers pas guidés (pur)
  seasons.js          saisons réelles : teintes de berge + narration (pur)
  items.js            trésors rares : raretés, paliers, drops, bonus (pur)
  photocard.js        carte photo partageable (dessin autonome)
  minigame.js         pêche (logique pure)
  toboggan.js         toboggan de rivière : 2e mini-jeu (logique pure)
  render.js           rendu canvas 160×120 (expressions, particules, squash)
  audio.js            bus de mixage WebAudio (master/sfx/musique/ambiance) + ducking + volume + SFX + vibrations
  music.js            boucle chiptune jour/nuit, timbre par saison (partition pure testée)
  ambient.js          lit d'ambiance procédural (eau, oiseaux, vent, grillons — pur testé)
  ui.js               DOM : HUD, jauges, overlays
  pwa.js              service worker, bouton installer, persistance
  main.js             orchestrateur
test/                 tests : moteur, features, combats, polish, fil narratif (node --test)
                      + parcours joueur complet en jsdom (smoke)
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

- Nouveaux lieux à explorer (forêt, mer) avec leurs activités
- Événements et quêtes saisonniers (bonhomme de neige l'hiver, cueillette l'automne…)
- i18n (en/es)

*Fait en v2.1 : accessoires, succès + records, export/import. v2.2 : pelages,
décors, combats par code. v2.3 : rythme resserré, quêtes du jour. v2.4 : game
feel (confettis, squash & stretch, jauges qui pulsent), loutre expressive
(humeurs, manies, décor vivant), carte photo partageable 📸. v2.4.1 : œuf à
bercer en secouant le téléphone, bouderie de réveil forcé, sieste vraiment
réparatrice, lancement instantané (cache d'abord). v2.5 : musique chiptune
jour/nuit, éclosion active bien plus payante (10 s par réchauffage, 8 s par
secousse), permission capteurs iOS demandée au premier toucher. v2.6 : niveaux
du soigneur (XP visible, titres, récompenses de palier, barre permanente).
v2.7 : série de jours 🔥, plus de mort (chez le héron + rituel de retour),
surprise quotidienne, partage du résultat du jour façon Wordle. v3.0 :
rappels push opt-in (« elle a faim », héron, quêtes) via un petit serveur
Supabase gratuit — fonction `push`, cron 10 min, abonnements anonymes. v3.1 :
l'aventure prend forme — éclosion cinématique (œuf qui se fissure et tremble),
fil narratif en chapitres (naissance, jeune, adulte) et premiers pas guidés
(le geste suivant est surligné et expliqué). v3.2 : monde vivant — les saisons
réelles habillent la berge (printemps/été/automne/hiver, chacune sa teinte et
son ambiance : pétales, feuilles, neige) et une carte d'histoire annonce chaque
changement de saison. v3.2.1 : cartes d'histoire redessinées (mieux
dimensionnées, plus lisibles). v3.3 : second mini-jeu — le toboggan de rivière
(esquive à 3 couloirs), débloqué au stade jeune, avec son succès et son record.
v3.3.1 : câlins rendus découvrables (touche la loutre) et activités verrouillées
qui expliquent leur déblocage. v3.4 : les saisons pèsent sur la santé — le froid
de l'hiver fait attraper froid, la chaleur de l'été épuise et fait surchauffer ;
on réchauffe/rafraîchit avec les gestes existants (bain, repas, câlins). v3.5 :
trésor de saison — un cadeau thématique à récolter chaque jour (fleur, pastèque,
châtaigne, bonhomme de neige) avec sa récompense et un record dédié. v3.6 :
les activités se débloquent désormais au fil des niveaux du soigneur (Niv 2→5)
plutôt que par stade de vie — chaque montée de niveau offre une nouveauté ; et
vraie police pixel embarquée (Pixelify Sans, woff2 en data-URI, accents FR + œ,
100% hors-ligne) à la place de Courier. v3.7 : progression étendue à 50 niveaux
(courbe qui se durcit, titres jusqu'à « Gardien légendaire ») et combat repoussé
au niveau 10. v3.8 : trésors rares équipables (4 raretés, petits bonus de jeu :
XP, jauges plus lentes, résistance aux saisons…), gagnés par paliers de niveau
garantis ET par drops aléatoires dans les activités. v3.9 : refonte audio —
vrai bus de mixage (ducking, volume réglable), lit d'ambiance procédural
(eau/oiseaux/vent/grillons selon saison et heure), musique teintée par la
saison, SFX à micro-variation de hauteur. v3.10 : le caractère de la loutre —
personnalité tirée au baptême (activité préférée + réactions uniques) et lien
qui grandit avec les soins (paliers célébrés, loutre plus démonstrative à haut
lien). v3.11 : accessibilité — mouvement réduit (pref système + interrupteur,
coupe particules/secousses/clignotements) et gros texte. v3.11.1 : mise à jour
automatique (fini les 2-3 relances). v3.12 : confort & contenu — 26 trésors et
14 paliers (au lieu de 12/6), bandeau « objectifs du jour » (quêtes + série)
visible en permanence, et menus repensés (garde-robe en onglets, boutons du bas
libellés, réglages rangés par section). v3.13 : cap « jeu pro » (1/2) — game
feel (menus qui fondent + zooment à l'ouverture/fermeture, retours de pression
sur tous les boutons, easing) et vrai écran-titre plein écran (loutre héroïque,
nom stylisé, accroche, bouton d'adoption soigné). v3.14 : cap « jeu pro » (2/2) —
direction artistique (scène en profondeur : soleil et halo, nuages qui dérivent,
collines lointaines brumeuses en perspective atmosphérique, brume d'horizon,
vignettage doux) et loutre plus vivante (respiration continue, clignements
naturels avec double-clignement occasionnel), le tout coupé en mouvement réduit.
v3.15 : montée en gamme graphique — ciel en dégradé, herbe texturée (brins +
fleurs) avec berge humide, rivière retravaillée (écume de rive, double couche de
rides, scintillement du soleil sur l'eau), ombre de contact qui ancre la loutre
au sol, et roseaux de premier plan qui encadrent la scène (parallaxe/profondeur).
v3.16 : loutre vivante (1/… « qualité pro ») — elle flâne librement sur la berge
(balade d'un point à l'autre + dandinement), relief lumineux sur son pelage
(liseré soleil le jour / lune la nuit + occlusion sous le ventre pour le volume),
et une vraie voix (petits couinements de loutre quand on la caresse). Le tap-à-
câlin suit désormais sa position vivante. Balade coupée en mouvement réduit.
v3.16.1 : la berceuse de nuit ne « disparaissait » plus qu'à moitié — remontée
d'une octave, tenue et plus audible (une vraie mélodie, pas juste une basse) ; et
le pelage « Neige » redessiné (corps blanc froid + contour ardoise) pour une
silhouette nette au lieu d'un aplat blanc.
v3.17 : interaction directe (« la scène répond au doigt ») — on glisse le poisson
posé sur la berge jusqu'à sa bouche pour la nourrir, et on tape la berge ou l'eau
pour l'appeler (elle vient, petit plouf si on tapote l'eau). Les boutons restent.
Correctif au passage : la loutre ne se recentrait plus toute seule pendant ses
petites manies (elle reste où elle est, sauf combat/mini-jeu).
v3.18 : la Tanière — un second lieu, cosy (mur de terre, plancher, tapis,
lanterne, nid), où la loutre se repose et où l'on retrouve sa collection de
trésors exposée sur des étagères (gemmes colorées par rareté, compteur x/26).
Bouton 🏠/🌊 pour passer de la berge à la tanière ; taper un trésor l'identifie
(nom · rareté · bonus), et on peut toujours la caresser sur place.
v3.19 : ball-fetch — une balle est posée sur la berge ; on l'attrape et on la
lance (glisser puis relâcher, la balle décrit un arc jusqu'au point de largage),
la loutre court la chercher et la rapporte fièrement dans sa gueule, avec une
petite récompense de jeu (humeur, lien, XP, couinement). Complète le trio
d'interactions directes (nourrir · appeler · jouer).
v3.20 : cap « expérience de jeu » (1/4) — le juice / game feel. Chiffres qui
jaillissent (pop-in + fondu), onde de choc à l'impact, secousse d'écran amortie
calibrée par événement, et hit-stop (micro-gel qui donne du poids aux gros
moments). Feedback branché sur chaque action (repas · bain · caresse · pêche ·
soin · friandise · plongée · balle · montée de niveau · éclosion · évolution),
le tout coupé/atténué en mouvement réduit.
v3.21 : cap « expérience de jeu » (2/4) — le shell d'UI de jeu. Jauges refondues
(icône + valeur chiffrée + piste creusée à liseré arrondi + reflet, remplissage
animé) avec alerte critique (glow rouge pulsé quand une jauge tombe sous 20).
Recharge visible sur les boutons d'action : voile radial qui s'ouvre + compte à
rebours (friandise, plongée). Barre de niveau retravaillée (dégradé + reflet).
v3.22 : cap « expérience de jeu » (3/4) — onboarding & découvrabilité. Après le
tuto de base, des astuces de gestes se révèlent UNE PAR UNE (flèche jaune qui
rebondit vers la cible + message) : caresser la loutre, glisser le poisson pour
la nourrir, tapoter l'eau pour l'appeler, lancer la balle, ouvrir la tanière 🏠.
Chaque astuce se classe dès que le joueur fait le geste (ou après un temps),
et n'apparaît qu'une fois (mémorisé). Coupée en mouvement réduit (flèche fixe).*
