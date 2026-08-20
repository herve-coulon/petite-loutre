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
et n'apparaît qu'une fois (mémorisé). Coupée en mouvement réduit (flèche fixe).
v3.23 : cap « expérience de jeu » (4/4) — célébration de la progression. Les
montées de niveau déclenchent une vraie bannière plein-écran : rayons de lumière
qui tournent, gros numéro doré qui pop, titre honorifique, et la récompense mise
en avant (trésor coloré par sa rareté / déblocage / friandise). Même traitement
pour les évolutions (bébé → jeune → adulte). Ferme au toucher, coupée en
mouvement réduit. Clôt les 4 piliers du cap « proche du gaming ».
v3.23.1 : correctif notifications iPhone. Sur iOS, le push web n'existe QUE dans
l'app installée sur l'écran d'accueil (jamais en onglet Safari) — au lieu d'un
« indisponible » opaque, on guide désormais l'utilisateur (Partager → écran
d'accueil → rouvrir depuis l'icône), on révèle l'astuce d'installation, on
affiche une note d'emblée dans les Réglages, et on détecte aussi l'iPad récent.
v3.24 : overlays transformés en vrais « panneaux de jeu » (garde-robe, succès,
réglages, combat, photo) — cadre doré arrondi, bandeau de titre plein-largeur
avec bouton fermer épinglé dans le coin, séparateurs de section à filets, et
barre de défilement discrète.
v3.25 : refonte de la mise en page — l'écran de la loutre devient la pièce
maîtresse (plein-largeur, centré). Les actions passent en surimpression sur ses
bords : colonne de gauche (Manger · Laver · Friandise), colonne de droite
(Jouer · Dodo · ➕). Le ➕ ouvre un menu « Activités » (Plongée · Toboggan ·
Combat · Soigner). Jauges compactes en bande basse. Pied de page réduit à 3
(Garde-robe · Succès · Réglages) — le Son rejoint les Réglages, la Photo le
panneau Succès. Titre retiré. Bouton tanière recentré en haut.
v3.26 : fondation de l'aventure à trois échelles (Monde → Berge → Tanière).
Nouveau module world.js (pur, testé) : les échelles, la carte d'exploration à
débloquer par niveau (berge, amont, cascade, forêt, grand lac) et la logique de
navigation. Charpente pour la refonte plein écran immersive à venir.
v3.27 : architecture de l'aventure (couche logique, sans visuel). Navigation
entre échelles dans world.js (zoom avant/arrière : monde ↔ berge ↔ tanière, avec
règles d'accès). Nouveau module gang.js (pur, testé) : la couche sociale —
créer/recruter un gang de loutres, puissance de bande, génération de gangs
adverses dosés (seedée), et combats de gangs en relais (roi de la colline,
reproductibles) bâtis sur le moteur de duel existant.
v3.28 : suite de la couche logique (toujours sans visuel). Persistance du gang
et des cadeaux de saison dans les records globaux (survivent aux loutres, testé
en aller-retour). Système de recrutement (gang.js) : tableau de recrues du jour
seedé + coût en XP proportionnel à la puissance. Nouveau module seasonpass.js
(pur, testé) : un cadeau exclusif par saison, réclamable une fois par (saison,
année), preuve de jeu requise.*
v3.77 : quêtes du jour jamais impossibles. Le pool s'étend à 20 objectifs
(soin, pêche, combat, toboggan, plongée, vallée) avec un filtre d'éligibilité
déclaratif (niveau, features, monde) : un joueur niveau 1 ne reçoit jamais
« Livrer 1 combat ». Le tirage reste déterministe par date — les quêtes
inéligibles sont remplacées (pas supprimées) pour garder 3 objectifs. Cinq
nouvelles actions de quête branchées sur la vallée : visiter le lieu du jour,
parler à un habitant, ramasser des trouvailles, glisser, plonger. Bandeau
« lieu du jour ×2 » affiché sous la quête quand le monde est ouvert.*
v3.77.1 : niveau « cliquet » — recruter un habitant ne redescend plus jamais.

Le champ levelReached dans les records mémorise le palier le plus haut atteint
(par gain d'XP ou recrutement) ; les paliers, zones, quêtes, badge, profil,
partage, carte postale et achievements s'affichent au niveau effectif (jamais
inférieur au précédent). Le profil montre désormais les paliers franchis au fil
du jeu.*
v3.78 : badge « Exploratrice » pour avoir découvert les 15 lieux de la vallée.

Toast repositionné en haut à droite ; jauges muettes (plus de compteur
numérique).*
v3.79 : les coûts sont clairs. Le recrutement en escouade affiche le solde XP
et ce qu'il reste après l'embauche. La garde-robe demande confirmation avant
chaque achat en gemmes (chapeaux, pelages, décors, trésors).*
v3.80 : harmonisation des loutres. PAL et grilles pixel alignés sur le kit
designer (Side pour le monde, Face pour les portraits). Les 8 animations
nouvelles (sleep, dream, wake, hungry, sick, hurt, cold, hot) sont intégrées
depuis le manifeste, animForMood enrichi, HUD et carte de rencontre peints
avec le pelage vivant, Œuf crème, pelages dotés de la clé q.*
v3.81 : télémétrie privacy-first. Un ping quotidien anonyme (niveau, série,
fonctionnalités utilisées) vers Supabase. Opt-out dans ⚙️, aucun envoi tant
que la loutre n'est pas nommée. SQL et edge function fournis dans le rapport,
prêts à déployer côté serveur.*
v3.81.1 : pastille profil miniature. La pastille HUD affiche la tête de la
loutre centrée dans le cercle (pelage vivant + chapeau) au lieu d'un emoji
ou d'un canvas plein corps. Overflow hidden pour clipper au cercle.*
v3.83 : cache API Kimi côté serveur (Supabase Edge Function) pour réutiliser
les réponses identiques et économiser les crédits token — appels frontend via
`askKimi()`, clé API protégée côté serveur, TTL réglable et suivi des hits.*
v4.10.0 : Une nuit ne fait plus perdre sa loutre — la détresse patiente 💔🕊️. Problème signalé :
on se réveille et la loutre est déjà partie chez le héron. En cause : dès que la santé touchait
0 (faim à sec + maladie qui s'accumulent la nuit), le départ était IMMÉDIAT. Désormais, à bout de
forces la loutre entre en DÉTRESSE mais ne file pas aussitôt : elle tient AWAY_GRACE (12 h) en
t'attendant. De quoi la sauver au réveil — une simple nuit d'absence ne coûte plus la loutre ;
seule une négligence prolongée (~un jour entier) l'envoie bouder. Un message d'alerte « 💔 à bout
de forces… » (même au retour hors-ligne) et un « 💚 sauvée à temps » quand on la récupère. La
grâce s'applique aussi en rattrapage hors-ligne (pas par minute). État `s.criticalAt` + événements
`critical`/`rescued`. Tests refondus (détresse → grâce → départ ; sauvetage). 424 tests sim.*
v4.9.0 : Le jardin réinventé — récolte au bon moment 🌸⏱️. Problème : le jardin (taper des fleurs
/ grenouilles / papillons qui apparaissent) rejouait exactement le VERBE de la pêche (viser des
cibles). Deux jeux débloqués par niveau qui se ressemblaient. Le jardin a désormais un verbe
DISTINCT : le TIMING. Six parterres FIXES où les fleurs poussent sur place (graine → pousse →
bouton → PLEINE FLORAISON → fané) ; on récolte chacune PILE à sa pleine floraison — un halo
lumineux pulse pendant la fenêtre « parfaite » (tiers central) : parfait = +3, en bordure = +1,
raté = 0. Arroser 💧 une pousse la fait mûrir plus vite (pour étaler des floraisons simultanées).
Plus AUCUNE cible mobile à taper : c'est de la lecture de maturité et de la patience, pas des
réflexes. Fleurs rares dorées (×2) et bouquet bonus conservés ; grenouilles/papillons retirés (ils
étaient le « taper des cibles » de trop). Réécriture pure de garden.js (`plotState`, timing du
`harvestAt`) + rendu parterres/halo + tests refondus. Vérifié navigateur : parterres, pousses,
indice « laisse pousser 💧 », récolte « vise la pleine floraison », zéro erreur. 422 tests sim.*
v4.8.0 : Bonus de variété — le jeu libre varié récompensé ✨. Audit gameplay, point #2 : les défis
(25 XP) ne « nerfent » pas le jeu libre — pour les compléter il faut faire les gestes — mais un
joueur cozy qui varie sans courir après les défis progressait lentement. Correction ADDITIVE (zéro
nerf) : la 1re fois qu'on fait CHAQUE activité dans la journée (repas, bain, sieste, friandise,
pêche, plongée, toboggan, jardin, combat) donne +5 XP, avec un petit toast « 1re … du jour ». Une
journée VARIÉE rapporte donc davantage, sans toucher aux défis ni au rythme de retour quotidien ;
répéter la même activité ne donne le bonus qu'une fois. Suivi `s.dayActs` (remis à zéro chaque
jour). Tests unitaire + smoke (1er repas = base 5 + variété 5, 2e = base seule, pas de doublon).
424 tests sim.*
v4.7.0 : Chaque montée de niveau redonne quelque chose 💎. Audit gameplay → le point #1 : après
le niveau 10, monter d'un niveau ne débloquait plus rien de neuf (les trésors de palier ne tombent
qu'aux niveaux 3/5/7/10/13/16/19… — 2-3 niveaux « creux » entre chacun), et les gemmes (monnaie
premium : friandise express, trousse de soins, achats au Marché) étaient rares (troc seulement).
Désormais CHAQUE montée de niveau crédite des gemmes — flux croissant (`2 + niveau/5`) avec jackpot
aux paliers (+5 tous les 5 niveaux, +12 tous les 10). Les niveaux creux ne sont plus vides, et le
Marché a enfin de quoi tourner sur toute l'ascension. La carte de niveau affiche « 💎 +N » (en plus
du trésor / déblocage éventuel). Fonction pure `levelUpGems(level)` (level.js) + tests. Vérifié
navigateur : niveau 5 → trésor Brindille + 8 💎, carte de célébration nickel. 424 tests sim.*
v4.6.1 : Ménage de code (santé, zéro changement visible) 🧹. Audit du dépôt → deux vrais gains.
(1) `world.js` supprimé : ancien système « échelles/lieux » (89 lignes) remplacé de longue date
par les zones de `tilemap.js`, plus aucun de ses exports importé nulle part — mais toujours livré
dans le PRECACHE et testé (78 lignes de tests pour du code mort). Retiré du dépôt, du sw.js et de
package.json. (2) Contexte des quêtes UNIFIÉ : `questCtx()` (main.js) et `questContextFor()` (ui.js)
calculaient exactement la même chose en double — vrai risque de désynchro (il fallait éditer les
deux à chaque nouvelle activité). Source unique `questContext(level, world)` + `QUEST_FEATURES`
dans quests.js ; les deux appelants n'en sont plus que des enveloppes. Tests verts (423 sim).*
v4.6.0 : Le Jardin devient une vraie activité 🌿🦋. Suite du correctif v4.5.1 : plutôt que de
supprimer le bouton Jardin, on lui donne enfin un rôle. Le 🌿 revient dans la colonne de droite
comme ACTION DE PREMIER PLAN (verrou « Niv 4 » comme plongée/toboggan, tapable pour expliquer le
déblocage) et lance le mini-jeu jardin DIRECTEMENT depuis la berge — plus besoin de voyager
jusqu'à la zone du monde ouvert. Nouvelle variété dans le jardin : des PAPILLONS 🦋 qui dérivent
dans l'air (attrape-les, +2), des FLEURS RARES dorées qui valent +3 au lieu de +1, et un BOUQUET
BONUS (+5) si on récolte au moins 6 fleurs dans la partie. + un défi quotidien « Jardiner » (2
paliers). Module `garden.js` enrichi (papillons à dérive sinusoïdale, flag rare, compteur de
récolte) et testé ; rendu des papillons (ailes qui battent) et des fleurs rares (halo doré) ;
`endGarden` compte le défi jardin et annonce le bouquet. Correction au passage : les quêtes à
prérequis n'étaient éligibles « sans contexte » que par défaut — tests de neutralisation durcis
(tout le pool marqué fait). Vérifié navigateur : bouton débloqué qui lance le jardin depuis la
berge, quête complétée ; le rendu canvas des nouveautés est couvert par les tests unitaires
(boucle rAF gelée en aperçu). 433 tests sim.*
v4.5.1 : Correctif — bouton fantôme retiré 🌿. Le bouton rond « Jardin » (b-garden) traînait
dans la colonne de droite : la fonctionnalité avait déménagé dans le monde ouvert (zone jardin),
mais le bouton était resté — masqué par l'attribut HTML `hidden`… sauf que `.roundbtn{display:flex}`
l'emportait sur `[hidden]`, donc il s'affichait quand même, en vert vif « disponible », SANS aucun
gestionnaire : le toucher ne faisait rien. Audit complet des boutons : c'était le SEUL sans
handler de toute l'app (les autres boutons ronds verrouillés — plongée/toboggan/combat — sont
intentionnels : 🔒 + « Niv X », tapables pour expliquer comment débloquer). Bouton supprimé ;
la colonne de droite ne montre plus que les 4 vraies actions. Vérifié navigateur.*
v4.5.0 : Les défis du jour derrière une pastille 🎯 (+ plus de variété). Correctif d'affichage :
la bannière de quête FIXE en bas d'écran encombrait la vue et chevauchait le journal sur les
écrans courts. Elle disparaît au profit d'une pastille compacte « 🎯 x/3 » dans la rangée des
compteurs (dorée quand les 3 défis sont relevés) ; la toucher ouvre un overlay propre qui liste
les 3 défis du jour (icône, libellé, barre de progression, ✓) + le rappel du lieu du jour. On
gagne toute la hauteur que la bannière volait. Côté contenu : le pool passe de 21 à 39 défis
(paliers plus fins en soin/pêche, 2e/3e paliers combat·toboggan·plongée·monde) et le tirage
quotidien garantit désormais 3 activités DISTINCTES (jamais « 2 repas » ET « 3 repas » le même
jour). Tests `quests.test.js` (clés distinctes) + smoke (pastille visible, 0/3→3/3 dorée, overlay
à 3 défis). Vérifié navigateur : plus de chevauchement, pastille + overlay nickel, zéro erreur.
428 tests.*
v4.4.0 : Les slots de sauvegarde — plusieurs loutres en parallèle 🗂️. On peut désormais
élever jusqu'à 3 loutres, chacune dans son monde COMPLET et ISOLÉ (sa loutre, sa lignée, sa
collection, ses monnaies). ⚙️ Réglages → « 🗂️ Changer de loutre… » ouvre un écran qui liste
les 3 emplacements : l'actuel marqué, les occupés avec portrait + nom + génération, les libres
qui invitent à commencer. Choisir un emplacement demande confirmation puis recharge (le SW rend
ça instantané et hors-ligne, et on repart d'un état 100 % propre). On peut effacer un AUTRE
emplacement (jamais l'actuel — géré en jeu). Choix d'ingénierie assumé : localStorage SEGMENTÉ
par slot plutôt qu'IndexedDB (3 petites sauvegardes → l'async d'IDB serait du risque pur) ; le
chemin chaud (persist/boot/hors-ligne) reste 100 % synchrone et INCHANGÉ, et le Slot 1 garde les
clés d'origine — ta sauvegarde existante DEVIENT le Slot 1, sans aucune migration. Un `storage`
proxy redirige les clés d'état+records vers le slot actif ; module pur `slots.js` (clé par slot,
bornage, résumé d'affichage). Piège corrigé (vérifié navigateur) : au changement de slot, on ne
réoriente PAS le storage en place — sinon un tick tardif écrivait la loutre courante dans le slot
cible ; on gèle les écritures (`switching`) jusqu'au reload. Tests `slots.test.js` + smoke (3
emplacements, l'actuel marqué, confirmation avant bascule). Vérifié navigateur : aller-retour
entre deux loutres, isolation parfaite, zéro perte, effacement d'un autre emplacement. 427 tests.*
v4.3.0 : Le cœur long-terme, Phase 3 — le souvenir jouable 🌙. Dans le Carnet → 🕊️ Lignée,
chaque aïeule du mémorial devient tappable (« 🌙 revivre un souvenir »). Le toucher ouvre un
moment tout doux, contemplatif, sans le moindre enjeu : sous un ciel étoilé, l'aïeule DORT et
RÊVE — l'animation `dream` jouée dans SON pelage (boucle rAF autonome, coupée à la fermeture) —
avec son nom, sa génération, l'âge qu'elle a vécu, et une PHRASE DE SOUVENIR teintée par son
caractère (« ses câlins sans fin — toujours un de plus » pour une câline). Un « Merci pour tout 💛 »
referme. Module pur `memory.js` (souvenir déterministe et stable par loutre, coloré par le trait)
testé ; nouvel export `paintDream` (render.js) ; overlay `ovl-souvenir` (z-index au-dessus du
Carnet). Tests `memory.test.js` + smoke (aïeule tappable → rêve ouvert, nom & phrase, ✕ referme).
Vérifié navigateur : Néo endormie et rêvant dans son ciel de nuit, souvenir de câline, zéro erreur.
420 tests sim. Le cœur long-terme est complet : la lignée, la fin douce, et le souvenir.*
v4.2.0 : Le cœur long-terme, Phase 2 — la vieillesse célébrée 🕊️. La mortalité douce
entre en jeu, mais en OPT-IN, éteinte par défaut : le jeu cozy reste intact pour qui
préfère garder sa loutre toujours auprès de soi. Un réglage ⚙️ « 🌿 Cycle de vie complet »
(activation confirmée, réversible à tout moment) l'allume. Une fois activé, deux fins —
toutes deux PAISIBLES, jamais un échec : la VIEILLESSE (après ~7 jours la loutre devient
aînée « le poil argenté », puis s'en va sereinement, fêtée, vers ~10 jours) et l'ANTICHAMBRE
DU HÉRON (si on ne la ramène pas sous ~3 jours, elle s'en va tout doux de là-bas). Dans les
deux cas : une carte d'adieu (« elle a bien vécu »), puis un œuf reprend le fil — le mémorial
et l'héritage de la Phase 1 font le reste. Le réglage est GLOBAL (survit aux générations).
Module pur `lifecycle.js` (seuils réglables, `isElder`/`endOfLife`, le héron prime sur l'âge)
testé ; migration douce (`rec.lifecycle`, `s.elderSeen`). Tests `lifecycle.test.js` + smoke
(bouton OFF par défaut, activation via confirmation, réversible). 425 tests sim.*
v4.1.0 : Le cœur long-terme, Phase 1 — la lignée & le mémorial 🕊️. Jusqu'ici,
« Recommencer à zéro » effaçait la loutre. Désormais, elle PASSE LE RELAIS : la loutre
sortante rejoint un mémorial (nom, personnalité, âge vécu, portrait, génération), et la
suivante HÉRITE souvent (70 %) de son caractère — un vrai fil des vies, sans introduire
la mort (la Phase 2, la vieillesse célébrée, viendra en opt-in). Le Carnet gagne une
4e section « 🕊️ Lignée » : la loutre actuelle (génération N, « de la lignée de … ») en
tête, puis les aïeules avec leur portrait (paintBadge) et l'âge atteint. Et des
portraits encadrés de la lignée veillent sur le mur de la tanière. Le baptême annonce
l'ascendance et le trait transmis ; le « Recommencer » est reformulé (elle rejoint la
lignée, chapeaux/succès conservés). Module pur `lineage.js` (fiche d'aïeul, héritage
du trait) testé ; migration douce (`memorial`, `generation`, `heirOf`, `heirTrait`).
Tests `lineage.test.js` + smoke (le relais inscrit l'aïeule, génération +1, portraits).
Vérifié navigateur : Lignée (Néo génération 3 « de la lignée de Rade », mémorial de
Rade/Ondine avec portraits aux bons pelages), zéro erreur. 482 tests.*
v4.0.0 : Le Dojo de parade — un entraînement QUOTIDIEN à la parade 🥋. Nouveau bouton
latéral 🥋 : une séance de 8 assauts télégraphiés, seedés par le jour (même
enchaînement pour tous, comme la Crue). Chaque assaut a une annonce (windup) puis une
fenêtre de parade qui se resserre au fil de la séance ; on touche « 🛡️ Parer » au bon
moment — parfait (centre de la fenêtre) / bien / raté, avec bonus de combo. Score →
ceinture (blanche → noire) et récompense NON-puissance une fois par jour (💎 1-5 +
🐟 6-30 + XP), dosée à la perf ; meilleur score enregistré (→ Records du Carnet).
Piloté au temps réel (setTimeout + horloge), cœur de jugement PUR (`dojo.js` :
enchaînement, jugement, combo, score, ceintures, récompense). Migration douce
(`dojoBest`, `dojoDay`). Tests `dojo.test.js` + smoke. Vérifié navigateur : séance
lancée, boucle annonce→fenêtre→résultat, écran final (⚪ Ceinture blanche, récompense
+1 💎 +6 🐟 +20 XP, récompense une fois/jour), zéro erreur. 478 tests. On passe la
barre des 4.0 — la vallée a de quoi occuper chaque jour.*
v3.99.0 : L'Almanach de saison — 8 paliers gratuits qui rythment la saison. Le cadeau
de saison UNIQUE (bouton 🎁) devient une PISTE de 8 paliers, pilotée par les trésors
de saison déjà récoltés (`treatsBySeason` de l'É3, sur laquelle l'Almanach « s'appuie »).
Chaque coquillage / trésor du jour fait avancer la piste ; on réclame palier par palier
des lots NON-puissance (💎 5 → 🐟 25 → 🐚 4 → 🛠️ matériaux → 💎 10 → 🐟 50 → 💎 18 →
palier 8 = l'ancien cadeau 💎 15 + 🐟 60). Réinitialisée à chaque saison (clé
saison-année), réclamation unique par palier, badge « ! » sur 🎁 dès qu'un palier est
mûr. Module pur `almanach.js` (paliers, progression, états, réclamation) + overlay
`ovl-almanach`. Migration douce (`rec.almanach` défaut {}) ; l'ancien claim unique est
remplacé (le palier final marque `seasonGifts` pour la compat). Tests `almanach.test.js`
(seuils croissants, états, réclamation unique, fish portefeuille+à-vie, cadeau final) +
smoke. Vérifié navigateur : Été 2026, 8 paliers (4 mûrs / 4 verrouillés), réclamation
palier 1 (+5 💎, « Obtenu ✓ », 1/8), zéro erreur. 472 tests.*
v3.98.0 : Le Carnet du naturaliste — bestiaire, trouvailles et records réunis. Trois
choses étaient éparpillées : le bestiaire (son propre écran), les records (une ligne
noyée dans Succès), et les trouvailles (aucun album — `rec.found` ne gardait que des
ids éphémères). Le Carnet les UNIFIE en un carnet à trois sections (onglet Profil
« 📖 Carnet » qui remplace l'ancien « Bestiaire ») : 🐾 Bestiaire (créatures vues/
attrapées, X/total), 🍄 Trouvailles (l'album des 16 sortes — poisson, champignon,
gemme… nénuphar — découvertes en clair, verrouillées en ❓, suivies dès maintenant
via `rec.foundKinds` renseigné au ramassage), 🏆 Records (11 stats à vie, durée
formatée), le tout coiffé d'un taux de complétion global (« Carnet rempli à N% »).
Zéro nouveau fichier ni nouvelle mécanique : de la mise en scène. Migration douce
(`foundKinds` défaut []). Test smoke (3 sections, bascule, 16 sortes dont N
découvertes, fermeture). Vérifié navigateur : le Carnet s'ouvre, en-tête 38% ·
🐾 2/8 · 🍄 7/16, album des trouvailles, records chiffrés, zéro erreur. 467 tests.*
v3.97.0 : équilibrage des prix + « solde après achat » (Phase 3 du Marché). Le vrai
déséquilibre repéré : les poissons S'ENTASSENT (pêche généreuse, peu de puits) tandis
que les coquillages sont rares — et le troc ne demandait QUE des coquillages, donc il
servait peu et l'économie ne circulait pas. Correctif : le troc quotidien gagne une
3e offre **🐟 → 💎** (12-16 poissons pour 1 gemme) qui donne enfin un débouché à
l'abondance de poissons, et les trois offres suivent une échelle de valeur cohérente
et documentée (1 💎 ≈ 3 🐚 ≈ 12 🐟). Partout où l'on dépense, on voit désormais le
**solde après achat** : chaque offre du troc affiche « il te restera N », et les
achats express en gemmes (friandise, trousse de soins) annoncent le reste. Le
recrutement (6 → 30 poissons, ~1-4 parties de pêche) était déjà cohérent : conservé.
Zéro nouveau fichier ; `dailyBarter` et le troc généralisés (débit en coquillages OU
poissons). Tests `economy.test.js` mis à jour (3 offres, échelle, débouché poisson).
Vérifié navigateur : les 3 offres, l'échange 🐟→💎 (−13 🐟 / +1 💎), le « solde après
achat », HUD à jour. 466 tests.*
v3.96.0 : Le Marché — l'économie enfin VISIBLE. La plomberie économique existait
(poissons/coquillages/gemmes, repas, recrutement, troc, atelier) mais restait
invisible et dispersée : monnaies lues comme de simples stats, points de dépense
enterrés dans des sous-menus, troc accessible seulement en marchant jusqu'à Gaspard
au lac. Nouveau HUB « 🪙 Le Marché » (onglet Profil + overlay) : en-tête « ta bourse »
avec les 3 monnaies, puis 4 tuiles qui rassemblent l'existant sans le dupliquer —
Cosmétiques (garde-robe, 💎), Troc du jour (enfin atteignable partout, sans marcher),
Atelier (fusion de doublons), Recrutement (🐟). Surtout, la bourse du HUD devient
TAPPABLE : toucher 🐟 / 🐚 / 💎 ouvre le Marché avec la monnaie mise en avant, et un
petit mot d'accueil la 1re fois — les compteurs passent de « stats » à « argent ».
Zéro nouvelle mécanique, zéro nouveau fichier : que de la mise en scène. Migration
douce (`marcheSeen`). Test d'intégration (ouverture onglet + pastille HUD, 4 usages,
le troc s'ouvre sans le monde). Vérifié navigateur : le hub s'ouvre, monnaie tapée
surlignée, tuile Troc ouvre le barter, zéro erreur console. 466 tests.*
v3.95.0 : Dialogues vivants, version LOCALE (on abandonne l'appel Kimi). Même
ressenti — les habitants varient leur accueil — mais 100 % sur l'appareil : gratuit,
hors-ligne, instantané, déterministe. `dialogue.js` devient un générateur pur seedé
(`livingLine`) qui garde la VOIX de chaque habitant (une de ses répliques signature)
et y ajoute une remarque de l'instant selon la météo (repli saison), personnalisée
au nom de la loutre et seedée par le jour+lieu (varie chaque jour, stable dans la
journée). Le réglage ⚙️ « Dialogues vivants » passe ON par défaut (plus rien à
payer) avec bascule unique pour les anciennes saves ; on peut toujours revenir aux
dialogues écrits. `kimi-client.js` + `kimi-cache-key.js` sortent du PRECACHE (bundle
joueurs allégé, Option B) ; l'Edge Function `kimi-chat` reste déployée mais dormante,
plus aucun appel réseau ni clé requise. Tests purs `dialogue.test.js` réécrits
(déterminisme, variété jour à jour, priorité météo/saison, sans emoji). Vérifié
navigateur : réglage ON par défaut, module servi générant bien « voix + remarque
météo » qui varie par jour, zéro erreur console. 473 tests.*
v3.94.0 : les Dialogues vivants (É6 — Option A). `kimi-client.js` avait un client
mais aucun consommateur : il en a un désormais. Quand le réglage ⚙️ « Dialogues
vivants » est activé (OFF par défaut, opt-in, nécessite une connexion), les habitants
de la vallée improvisent leur accueil via Kimi, avec le contexte de l'instant (nom &
personnalité de la loutre, saison, météo, lieu, niveau — module pur `dialogue.js`).
Repli COMPLET sur les dialogues écrits dès que le réseau, le budget ou la latence
(> 2 s) font défaut : la salutation générée ne remplace que l'accroche, jamais les
lignes de gain/conseil, et hors ligne rien ne change — le jeu ne dépend JAMAIS du
réseau (règle d'or 6). Côté serveur, l'Edge Function `kimi-chat` gagne un PLAFOND de
coût MENSUEL (`kimi_usage` + `KIMI_MONTHLY_TOKEN_CAP`) : au-delà, elle refuse en 429
et le client bascule sur l'écrit. Migration douce (`s.livingDialogues`). Tests purs
`dialogue.test.js` (prompt contextuel, robustesse, nettoyage). Vérifié navigateur :
réglage présent (OFF par défaut), bascule + persistance, zéro erreur console. 472
tests. (À déployer côté Supabase : `kimi-chat` + migration `kimi_usage`.)*
v3.93.0 : LA CRUE — le rendez-vous HEBDOMADAIRE (É5b, cœur du step). Chaque semaine
ISO, un module pur `crue.js` tire — de façon déterministe, seedée par la semaine —
un lieu de la vallée envahi, une météo qui l'habille (Crue d'orage/brume/canicule…),
et une CHAMPIONNE errante renforcée (×1,5 à ×2) aux talents VISIBLES. Deux joueurs,
la même semaine → exactement la même Crue (garanti par test). Onglet Profil → 🌊 La
Crue : la championne, ses talents, les 3 défis bronze/argent/or, et « Défier ». Le
duel réutilise l'arène tour-par-tour existante ; à la victoire, la médaille se lit
sur les PV restants (or ≥ 80 %, argent ≥ 50 %, sinon bronze), la MEILLEURE est
gardée, et chaque palier atteint se réclame une fois/semaine — récompenses
NON-puissance : matériaux d'atelier (doublons) + gemmes croissantes. Bannière
« La Crue a envahi <lieu> » à l'entrée de la vallée + notification optionnelle
« la Crue est arrivée » sur l'opt-in push existant. Migration douce (`rec.crue`,
`rec.crueNotified`). Tests : semaine ISO (bords d'année), Crue déterministe, « deux
joueurs même semaine », médailles, réclamation cumulative et non-doublée. Vérifié
navigateur : overlay Crue (Nixe ×1,5, talents 🌬️/⏳, 3 paliers), duel lancé avec
championne renforcée (135 PV), zéro erreur console. 469 tests.*
v3.92.0 : l'économie circulaire — les monnaies (É5a, la Crue suivra). Poissons et
coquillages CESSENT d'être de simples compteurs à vie et deviennent des monnaies
qui se DÉPENSENT, via deux portefeuilles neufs (`rec.fish`, `rec.shells`) alimentés
en parallèle des compteurs à vie (records/cadeau de saison intacts) et migrés depuis
eux (on ne vole rien : une vieille save récupère son cumul en portefeuille). (1) Le
repas se paie en poisson 🐟 (un vrai poisson rassasie mieux, +34) ; à sec, la
friandise gratuite prend le relais. (2) Le recrutement se paie en poissons (fini
l'XP-monnaie), prix doux progressif (6, 12, 18…). (3) Troc quotidien chez Gaspard le
troqueur du lac : coquillages ↔ poissons/gemmes, offres seedées par le jour, une par
jour. (4) Atelier de trésors à la tanière (onglet 🛠️) : 3 doublons d'un palier se
fondent en 1 trésor du palier supérieur (choix parmi 2, seedé) — les doublons de
plongée/pêche/coffres, jadis perdus, s'y accumulent. Module pur `economy.js` testé
(prix, troc déterministe « deux joueurs, même jour », fusion, migration). Vérifié
navigateur : HUD 🐟/🐚, repas −1 poisson, recrue à 12 🐟, atelier 3 communs → corail
rare. 462 tests.*
v3.91.0 : l'eau rendue à la berge. La rivière était décorative — elle devient
vivante et jouable. (1) Nage idle : de temps en temps la loutre part barboter
SEULE dans la rivière puis remonte, calée sur la ligne d'eau (rendu swim du kit,
branche autonome comme la plongée). (2) Rivière au doigt : toucher l'eau lance un
galet qui ricoche (3 rebonds amortis + éclaboussures), donne un petit +fun
(cooldown court seedé au jour, anti-spam), et déclenche la pêche/plongée — le
bouton 🤿 reste. (3) L'UI laisse respirer l'eau : bandeau de quêtes REPLIABLE
(chevron ▾/▸, état persisté `questCollapsed`) et barre d'actions qui s'estompe à
40 % après 5 s sans interaction (elle se réveille au moindre geste). Mesure : au
repos, l'eau occupe ≈ 26 % de l'écran 390×780 (bande y≈573→780), contre ~6 %
avant — la barre translucide et le bandeau replié la découvrent. Tests neufs
(`water-berge.test.js`) : nage idle sans crash sur longue session, galet peint
puis disparu (pas d'accumulation), `questCollapsed` défaut/persisté. 457 tests.*
v3.90.1 (HOTFIX mobile) : après un retour d'absence, tout le monde pouvait se
tasser dans le tiers haut-gauche de l'écran (ratio 1/dpr) jusqu'au rechargement —
l'échelle HiDPI se perdait en cours de session quand une paire `save/restore`
conditionnelle (souffle/squash) se déséquilibrait. Fix : la passe de rendu
RÉ-ANCRE l'échelle en tête de CHAQUE frame (`ctx.setTransform(dpr,0,0,dpr,0,0)`),
le renderer devient auto-réparant quel que soit un déséquilibre passé ; audit des
paires conditionnelles (prédicat mémorisé une fois, jamais recalculé entre save et
restore). Au passage, console propre au boot : le script inline de index.html
(refusé par la CSP `script-src 'self'`) devient `src/theme-color.js`, et la fonte
`data:` est autorisée par `font-src 'self' data:`. Deux tests neufs : équilibre
save/restore sur une frame qui franchit la fin d'un squash, et ré-ancrage dpr=3.*
v3.90.0 : toute la faune d'ambiance repasse en emoji (comme le bestiaire en v3.89.1) — le pixel de la faune était jugé laid, on garde le design d'origine ; les blocs `SPRITES_BESTIAIRE`/`SPRITES_FAUNE` et les couleurs `V`/`v` désormais inutiles sont retirés. Et surtout : dès qu'on ramasse un asset bonus (trouvaille), les points gagnés s'affichent sur place — un « +N XP / +N 💎 / +N 🐟… » chiffré (deltas réels) qui s'envole depuis la trouvaille et s'estompe. Chemin adouci et hibou « grand-duc » conservés.*
v3.89.1 : bestiaire remis en emoji — le pixel des 8 créatures (panneau + berge) a été jugé trop laid, retour au design précédent. La faune d'ambiance reste en pixel et le chemin adouci conservé.*
v3.89 : preuves de saison. Le cadeau de saison ne se réclamait que sur le
total de trésors à VIE — il tombait donc dès la 2e saison sans qu'on y ait
joué. Désormais un compteur PAR saison (`treatsBySeason`) : une nouvelle
saison n'offre son cadeau qu'après y avoir récolté un trésor. Migration douce
one-shot pour les saves en cours de saison (on ne vole pas le cadeau déjà
mérité), normalisation `{}` pour les autres.*
v3.88 : le bestiaire en pixel + chemin adouci. Les 8 créatures du bestiaire
et les 28 bestioles d'ambiance passent de l'emoji à des grilles pixel 16 px
(palette du kit, planche validée du designer) — fini l'emoji pour la faune et
le bestiaire dans le monde (charte DA). Fiches du bestiaire en sprites, avec
SILHOUETTE noire tant qu'une créature n'est pas rencontrée. Le chemin herbe/
terre reçoit un liseré d'herbe doux (mapping pur `pathEdge`, testé) au lieu de
l'escalier brut de tuiles. Hibou renommé « grand-duc » (cohérent avec son
tempérament paisible). L'œuf gardait déjà le ton du kit (palOver au rendu).*
v3.87 : une seule horloge, un seul peintre. Le ciel de la berge revient
ENTIÈREMENT au canvas via une source unique heure→palette extraite dans son
module pur `sky.js` (testée aux 4 heures repères 3 h / 7 h 30 / 12 h / 19 h 30 :
ciel et sol racontent toujours la même heure). Le dark mode ne repeint plus le
monde (fini le ciel de nuit sur une herbe de plein jour) — il ne touche que
l'UI. Frictions de v3.86 vérifiées déjà résolues (créatures bien sous le HUD,
pas de chip boussole parasite).*
