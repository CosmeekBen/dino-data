import type { DinoCard, PostStats } from '../types'

export type Archetype = 'flash' | 'slowburn' | 'steady' | 'spiky' | 'wave'
export type Rarity = 'commune' | 'rare' | 'épique' | 'légendaire'

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** Lit la forme de la courbe de stats du post et en déduit le "type" de dinosaure. */
export function analyzeCurve(curve: number[]) {
  const n = curve.length
  const max = Math.max(...curve, 1)
  const norm = curve.map((v) => v / max)
  const peakPos = n > 1 ? norm.indexOf(1) / (n - 1) : 0
  const third = Math.max(1, Math.floor(n / 3))
  const head = mean(norm.slice(0, third))
  const tail = mean(norm.slice(-third))
  const jitter = mean(norm.slice(1).map((v, i) => Math.abs(v - norm[i])))

  let archetype: Archetype
  if (peakPos < 0.25 && tail < 0.35) archetype = 'flash'
  else if (peakPos > 0.7) archetype = 'slowburn'
  else if (jitter > 0.22) archetype = 'spiky'
  else if (tail > 0.6 && head > 0.4) archetype = 'steady'
  else archetype = 'wave'

  return { archetype, peakPos, head, tail, jitter }
}

export function engagementScore(s: PostStats) {
  return s.likes + 2 * s.comments + 3 * s.shares + 3 * s.saves
}

export function rarityOf(s: PostStats): Rarity {
  const score = engagementScore(s)
  if (score > 1500) return 'légendaire'
  if (score > 700) return 'épique'
  if (score > 250) return 'rare'
  return 'commune'
}

export const ARCHETYPES: Record<
  Archetype,
  { label: string; emoji: string; blurb: string; promptTraits: string }
> = {
  flash: {
    label: 'Vélociraptor éclair',
    emoji: '🦖',
    blurb: 'Pic fulgurant dès les premières heures, puis retour au calme.',
    promptTraits:
      'a small, lean, extremely fast raptor-like dinosaur mid-sprint, sleek feathers, motion streaks, lightning energy, dynamic pose',
  },
  slowburn: {
    label: 'Sauropode lent',
    emoji: '🦕',
    blurb: 'Démarrage tranquille, puis le post prend de la hauteur sur la durée.',
    promptTraits:
      'a colossal long-necked sauropod rising above the clouds at golden sunrise, majestic and calm, enormous scale, neck stretching upward',
  },
  steady: {
    label: 'Ankylosaure blindé',
    emoji: '🦖',
    blurb: 'Une audience stable et fidèle, qui ne lâche jamais.',
    promptTraits:
      'a heavily armoured ankylosaurus with a spiked club tail, rock-solid stance, sturdy and unshakeable, earthy tones',
  },
  spiky: {
    label: 'Spinosaure en dents de scie',
    emoji: '🦖',
    blurb: 'Une courbe en montagnes russes, pleine de rebonds et de sursauts.',
    promptTraits:
      'a spinosaurus with a tall jagged sail like a stock-chart, wading through a stormy river, energetic and unpredictable',
  },
  wave: {
    label: 'Tricératops en vague',
    emoji: '🦖',
    blurb: 'Une montée, un pic, une descente douce : la vague classique.',
    promptTraits:
      'a triceratops charging over rolling hills, powerful and balanced, three horns lowered, wave-like landscape',
  },
}

const RARITY_STYLE: Record<Rarity, string> = {
  commune: 'plain, matte finish with a simple border',
  rare: 'silver foil frame with subtle holographic shimmer',
  épique: 'purple holographic frame with rainbow foil and sparkles',
  légendaire: 'full-art gold foil, intense rainbow holographic effect and radiant light rays',
}

/** Le prompt envoyé à GPT pour générer l'image de la carte. */
export function buildPrompt(card: DinoCard): string {
  const { archetype } = analyzeCurve(card.stats.curve)
  const rarity = rarityOf(card.stats)
  const a = ARCHETYPES[archetype]
  const hp = Math.min(999, Math.round(engagementScore(card.stats) / 4))
  return [
    'A collectible dinosaur trading card, portrait orientation, full card visible with rounded corners and a thin border, illustrated in a vibrant painterly style.',
    `Main subject: ${a.promptTraits}.`,
    `Card rarity "${rarity}": ${RARITY_STYLE[rarity]}.`,
    `Card title at the top, in bold clean lettering: "${card.dino}". Top-right corner: "PV ${hp}".`,
    'Bottom of the card: a small neat panel with a thin line-chart sparkline.',
    'No logos, no watermarks, no other text than the title and the PV number.',
  ].join(' ')
}
