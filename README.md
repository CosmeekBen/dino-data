# DinoDex

Les classeurs de cartes dinosaures d'Alice, Morgane, Emy et Ben. Chaque carte est liée à un post Instagram ; le dinosaure est généré par GPT d'après la **forme de la courbe de stats** du post.

```bash
npm install
npm run dev        # le site
npm run generate   # génère les images manquantes (voir plus bas)
npm run build
```

## Le classeur
Les classeurs sont dessinés en 3D sur un fond studio clair : couverture en matière mate soft-touch avec une fenêtre qui expose la meilleure carte du classeur, nom gaufré ton sur ton, anneaux métal et pages à pochettes plastiques. Typo : Bricolage Grotesque (titres) + IBM Plex Mono (données), auto-hébergées via `@fontsource`.

- **Tourner une page** : attraper le bord d'une page (ou de la couverture) et la faire glisser ; elle se plie et suit le doigt/la souris, puis retombe selon l'élan. Un clic, les flèches du clavier ou les boutons font la même chose en automatique.
- Au survol du bord, le coin se soulève légèrement.
- `src/lib/binderGeometry.ts` : géométrie (anneaux, dos, pages découpées en bandes pour la courbure), projection et éclairage.
- `src/lib/binderEngine.ts` : physique (glisser, ressort, rebond) et rendu — chaque face est projetée avec une `matrix3d` et l'ordre de peinture est géré à la main (plus fiable que le tri 3D du navigateur quand les anneaux traversent les pages).

## Ajouter une carte
Ajouter une entrée dans `src/data/cards.json` (les données actuelles sont des **données de démo**) :

```json
{ "id": "ben-11", "owner": "ben", "dino": "Rexita", "postUrl": "https://www.instagram.com/p/XXXX/",
  "postedAt": "2026-01-03",
  "stats": { "likes": 420, "comments": 18, "shares": 12, "saves": 30, "reach": 5200, "curve": [12, 90, 140, 80, 50, 30, 18] } }
```
`curve` = likes (ou autre métrique) par jour depuis la publication.

## Génération des images
`src/lib/curve.ts` lit la courbe (pic précoce → raptor, montée lente → sauropode, stable → ankylosaure, en dents de scie → spinosaure, vague → tricératops) et la rareté (engagement total). `npm run generate` envoie le prompt à l'API d'images OpenAI et écrit `public/cards/<id>.png`. Copier `.env.example` en `.env` et renseigner `OPENAI_API_KEY`. `--dry` affiche les prompts sans rien appeler. Tant que l'image n'existe pas, le site affiche une carte de secours.
