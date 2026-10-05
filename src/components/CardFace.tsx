import { useState } from 'react'
import type { DinoCard } from '../types'
import { ARCHETYPES, analyzeCurve, engagementScore, rarityOf } from '../lib/curve'
import { Sparkline } from './Sparkline'

export const cardImageUrl = (id: string) => `${import.meta.env.BASE_URL}cards/${id}.png`

/** Image GPT de la carte, ou une carte de secours dessinée en CSS tant qu'elle n'est pas générée. */
export function CardFace({ card }: { card: DinoCard }) {
  const [failed, setFailed] = useState(false)
  const rarity = rarityOf(card.stats)
  const a = ARCHETYPES[analyzeCurve(card.stats.curve).archetype]

  if (!failed) {
    return (
      <img
        className="card-art"
        src={cardImageUrl(card.id)}
        alt={`Carte ${card.dino}`}
        draggable={false}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div className={`card-fallback rarity-${rarity}`}>
      <div className="cf-head">
        <strong>{card.dino}</strong>
        <span>PV {Math.min(999, Math.round(engagementScore(card.stats) / 4))}</span>
      </div>
      <div className="cf-art">{a.emoji}</div>
      <div className="cf-type">{a.label}</div>
      <div className="cf-chart">
        <Sparkline data={card.stats.curve} height={40} />
      </div>
    </div>
  )
}
