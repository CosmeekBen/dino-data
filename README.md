# DinoDex

Les classeurs de cartes dinosaures d'Alice, Morgane, Emy et Ben. Chaque carte est liée à un post Instagram ; le dinosaure est généré par GPT d'après la **forme de la courbe de stats** du post.

```bash
npm install
npm run dev        # le site
npm run generate   # génère les images manquantes (voir plus bas)
npm run build
```

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
