/**
 * Génère l'image de chaque carte avec l'API d'images OpenAI (GPT).
 * Le prompt est construit à partir de la courbe de stats du post (voir src/lib/curve.ts).
 *
 *   npm run generate                    # toutes les cartes sans image
 *   npm run generate -- --only ben-3    # une carte précise
 *   npm run generate -- --force         # régénère tout
 *   npm run generate -- --dry           # affiche les prompts sans appeler l'API
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CardsData } from '../src/types'
import { analyzeCurve, buildPrompt, rarityOf } from '../src/lib/curve'

const args = process.argv.slice(2)
const force = args.includes('--force')
const dry = args.includes('--dry')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null

// charge .env sans dépendance
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const key = process.env.OPENAI_API_KEY
const model = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1'
const quality = process.env.OPENAI_IMAGE_QUALITY ?? 'medium'
if (!key && !dry) {
  console.error('OPENAI_API_KEY manquante (voir .env.example).')
  process.exit(1)
}

const data: CardsData = JSON.parse(readFileSync('src/data/cards.json', 'utf8'))
const outDir = join('public', 'cards')
mkdirSync(outDir, { recursive: true })

for (const card of data.cards) {
  if (only && card.id !== only) continue
  const file = join(outDir, `${card.id}.png`)
  if (existsSync(file) && !force) continue

  const prompt = buildPrompt(card)
  const { archetype } = analyzeCurve(card.stats.curve)
  console.log(`• ${card.id} (${card.dino}) — ${archetype}, ${rarityOf(card.stats)}`)
  if (dry) {
    console.log(`  ${prompt}\n`)
    continue
  }

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, prompt, size: '1024x1536', quality, n: 1 }),
  })
  if (!res.ok) {
    console.error(`  ✗ ${res.status} ${await res.text()}`)
    continue
  }
  const json = (await res.json()) as { data: { b64_json: string }[] }
  writeFileSync(file, Buffer.from(json.data[0].b64_json, 'base64'))
  console.log(`  ✓ ${file}`)
}
